/**
 * Audit Readiness — Share Links, Tokens, Auditor Access
 */
import { RequestContext } from '../../types';
import {
    assertCanSharePack, assertCanManageAuditors, assertCanViewPack,
} from '../../policies/audit-readiness.policies';
import { logEvent } from '../../events/audit';
import { createFinding } from '../finding';
import { createTask } from '../task';
import { runInTenantContext, runInGlobalContext, withTenantDb } from '@/lib/db-context';
import { notFound, badRequest, forbidden } from '@/lib/errors/types';
import { hashForLookup } from '@/lib/security/encryption';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { appendAuditEntry } from '@/lib/audit';
import { recordAuditPackShared } from '@/lib/observability/business-metrics';
import crypto from 'crypto';

/** Discriminator for a return-channel row (mirrors the Prisma enum). */
export type AuditShareCommentKind = 'COMMENT' | 'EVIDENCE_REQUEST' | 'FINDING' | 'QUESTION';

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ Token Hashing РІвЂќР‚РІвЂќР‚РІвЂќР‚

export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateShareToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ Share Pack РІвЂќР‚РІвЂќР‚РІвЂќР‚

export async function generateShareLink(ctx: RequestContext, packId: string, expiresAt?: string) {
    assertCanSharePack(ctx);
    const token = generateShareToken();
    const hash = hashToken(token);

    await runInTenantContext(ctx, async (tdb) => {
        const pack = await tdb.auditPack.findFirst({ where: { id: packId, tenantId: ctx.tenantId } });
        if (!pack) throw notFound('Audit pack not found');
        if (pack.status === 'DRAFT') throw badRequest('Cannot share a draft pack. Freeze it first.');

        await tdb.auditPackShare.create({
            data: {
                tenantId: ctx.tenantId,
                auditPackId: packId,
                tokenHash: hash,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                createdByUserId: ctx.userId,
            },
        });

        await logEvent(tdb, ctx, { action: 'AUDIT_PACK_SHARED', entityType: 'AuditPack', entityId: packId, details: JSON.stringify({ expiresAt }), detailsJson: { category: 'access', operation: 'permission_changed', detail: `Pack shared${expiresAt ? ` until ${expiresAt}` : ' (no expiry)'}` } });
    });

    recordAuditPackShared();
    return { token, expiresAt: expiresAt || null };
}

export async function revokeShare(ctx: RequestContext, shareId: string) {
    assertCanSharePack(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const share = await tdb.auditPackShare.findFirst({ where: { id: shareId, tenantId: ctx.tenantId } });
        if (!share) throw notFound('Share not found');
        if (share.revokedAt) throw badRequest('Share already revoked');
        await tdb.auditPackShare.update({ where: { id: shareId }, data: { revokedAt: new Date() } });
        await logEvent(tdb, ctx, { action: 'AUDIT_PACK_REVOKED', entityType: 'AuditPackShare', entityId: shareId, details: 'Share revoked', detailsJson: { category: 'access', operation: 'permission_changed', detail: 'Share link revoked' } });
        return { revoked: true };
    });
}

export async function getPackByShareToken(token: string) {
    const hash = hashToken(token);
    return runInGlobalContext(async (db) => {
        const share = await db.auditPackShare.findFirst({
        where: { tokenHash: hash, revokedAt: null },
        include: {
            pack: {
                include: {
                    items: { orderBy: { sortOrder: 'asc' } },
                    cycle: { select: { frameworkKey: true, frameworkVersion: true, name: true } },
                },
            },
        },
    });
    if (!share) throw notFound('Invalid or expired share link');
    if (share.expiresAt && share.expiresAt < new Date()) {
        throw forbidden('Share link has expired');
    }
        return {
            pack: share.pack,
            cycle: share.pack.cycle,
            items: share.pack.items,
        };
    });
}

// ─── Return channel: auditor → tenant (feat/auditor-return-channel) ───

const ACTIONABLE_KINDS: ReadonlySet<AuditShareCommentKind> = new Set([
    'EVIDENCE_REQUEST', 'FINDING', 'QUESTION',
]);

export interface AddShareCommentInput {
    kind: AuditShareCommentKind;
    body: string;
    /** External auditor's self-supplied display name/email; NOT a User FK. */
    authorLabel?: string;
    /** Optional pack item the comment is attached to. */
    auditPackItemId?: string;
}

/**
 * PUBLIC write path — a token-bearing external auditor sends a message
 * back to the tenant. Resolves the share cross-tenant in the GLOBAL
 * context (the caller is unauthenticated — the token IS the auth),
 * validates it (not revoked, not expired), then writes the row INSIDE
 * the resolved tenant's RLS context so the encryption middleware picks
 * the tenant DEK and the row lands isolated. `body` + `authorLabel` are
 * sanitised before persist.
 */
export async function addShareComment(token: string, input: AddShareCommentInput) {
    const body = sanitizePlainText(input.body).trim();
    if (!body) throw badRequest('Message body is required');
    if (body.length > 10000) throw badRequest('Message is too long');
    const authorLabel = (sanitizePlainText(input.authorLabel).trim() || 'External auditor').slice(0, 200);

    const hash = hashToken(token);

    // Resolve share cross-tenant (unauthenticated) — mirrors getPackByShareToken.
    const share = await runInGlobalContext(async (db) => {
        const row = await db.auditPackShare.findFirst({
            where: { tokenHash: hash, revokedAt: null },
            select: { id: true, tenantId: true, auditPackId: true, expiresAt: true },
        });
        if (!row) throw notFound('Invalid or expired share link');
        if (row.expiresAt && row.expiresAt < new Date()) throw forbidden('Share link has expired');
        return row;
    });

    const kind: AuditShareCommentKind = ACTIONABLE_KINDS.has(input.kind) || input.kind === 'COMMENT'
        ? input.kind
        : 'COMMENT';

    const created = await withTenantDb(share.tenantId, async (tdb) => {
        // Defensive: if an item is referenced, it must belong to this pack.
        if (input.auditPackItemId) {
            const item = await tdb.auditPackItem.findFirst({
                where: { id: input.auditPackItemId, auditPackId: share.auditPackId },
                select: { id: true },
            });
            if (!item) throw badRequest('Referenced pack item does not belong to this pack');
        }

        return tdb.auditPackShareComment.create({
            data: {
                tenantId: share.tenantId,
                auditPackId: share.auditPackId,
                auditPackShareId: share.id,
                auditPackItemId: input.auditPackItemId ?? null,
                kind,
                body,
                authorLabel,
                // COMMENT is informational; the actionable kinds start OPEN.
                status: 'OPEN',
            },
            select: { id: true, kind: true, status: true, createdAt: true },
        });
    });

    // Audit trail — external actor, no platform userId.
    await appendAuditEntry({
        tenantId: share.tenantId,
        userId: null,
        actorType: 'AUDITOR',
        entity: 'AuditPackShareComment',
        entityId: created.id,
        action: 'AUDIT_SHARE_COMMENT_ADDED',
        details: `Auditor ${authorLabel} submitted ${kind} on pack ${share.auditPackId}`,
        detailsJson: {
            category: 'custom',
            detail: `Auditor return-channel ${kind} received`,
        },
    });

    return { id: created.id, kind: created.kind, status: created.status, createdAt: created.createdAt };
}

export interface ShareCommentRow {
    id: string;
    kind: AuditShareCommentKind;
    body: string;
    authorLabel: string;
    status: 'OPEN' | 'RESOLVED';
    auditPackItemId: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedByUserId: string | null;
}

/**
 * Tenant read — surfaces the auditor return channel for a pack on the
 * internal pack detail page. Newest first. `body` decrypts transparently
 * via the middleware.
 */
export async function listShareComments(ctx: RequestContext, packId: string) {
    assertCanViewPack(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const pack = await tdb.auditPack.findFirst({ where: { id: packId, tenantId: ctx.tenantId }, select: { id: true } });
        if (!pack) throw notFound('Audit pack not found');
        const rows = await tdb.auditPackShareComment.findMany({
            where: { tenantId: ctx.tenantId, auditPackId: packId },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const openCount = rows.filter((r) => r.status === 'OPEN' && r.kind !== 'COMMENT').length;
        return { comments: rows as unknown as ShareCommentRow[], openCount };
    });
}

/**
 * Tenant action — mark an actionable return-channel row RESOLVED. A plain
 * COMMENT is informational and cannot be "resolved".
 */
export async function resolveShareComment(ctx: RequestContext, packId: string, commentId: string) {
    assertCanSharePack(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const row = await tdb.auditPackShareComment.findFirst({
            where: { id: commentId, tenantId: ctx.tenantId, auditPackId: packId },
            select: { id: true, kind: true, status: true },
        });
        if (!row) throw notFound('Return-channel entry not found');
        if (row.kind === 'COMMENT') throw badRequest('A comment cannot be resolved');
        if (row.status === 'RESOLVED') throw badRequest('Entry already resolved');

        const updated = await tdb.auditPackShareComment.update({
            where: { id: commentId },
            data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedByUserId: ctx.userId },
            select: { id: true, status: true, resolvedAt: true },
        });
        await logEvent(tdb, ctx, {
            action: 'AUDIT_SHARE_COMMENT_RESOLVED',
            entityType: 'AuditPackShareComment',
            entityId: commentId,
            details: `Resolved auditor ${row.kind}`,
            detailsJson: { category: 'status_change', operation: 'status_changed', detail: `Auditor ${row.kind} resolved` },
        });
        return updated;
    });
}

// Provenance key for auditor-raised findings — the idempotency guard so
// materialising the same return-channel comment twice is a no-op.
const AUDITOR_SHARE_COMMENT_SOURCE = 'AUDITOR_SHARE_COMMENT';

/**
 * feat/audit-cycle-unify — turn an external auditor's return-channel entry
 * into a real Finding (+ remediation Task), tied to the pack's cycle
 * fieldwork audit, then mark the comment RESOLVED with a link to the
 * created finding. Mirrors the internal checklist-FAIL cascade
 * (`cascadeChecklistFailure`): an auditor-raised FINDING must get the same
 * remediation lifecycle as an internal one, not just a status flip.
 *
 *   - FINDING          → Finding(NONCONFORMITY) + remediation Task.
 *   - EVIDENCE_REQUEST → Finding(OBSERVATION) + follow-up Task (the
 *                        auditor is asking for something; it needs an owner).
 *   - COMMENT/QUESTION → not materialisable (use resolveShareComment).
 *
 * Idempotent on (sourceKind, sourceRef=commentId): a second call returns
 * the already-created finding instead of duplicating it.
 */
export async function materializeShareCommentFinding(ctx: RequestContext, packId: string, commentId: string) {
    assertCanSharePack(ctx);

    // One read pass: the comment, an existing materialisation, the pack's
    // cycle → a fieldwork audit (so readiness's audit.auditCycleId join sees
    // it), and the linked control if the comment targets a control item.
    const loaded = await runInTenantContext(ctx, async (tdb) => {
        const comment = await tdb.auditPackShareComment.findFirst({
            where: { id: commentId, tenantId: ctx.tenantId, auditPackId: packId },
            select: { id: true, kind: true, body: true, status: true, auditPackItemId: true },
        });
        if (!comment) throw notFound('Return-channel entry not found');
        if (comment.status === 'RESOLVED') throw badRequest('Entry already resolved');
        if (comment.kind !== 'FINDING' && comment.kind !== 'EVIDENCE_REQUEST') {
            throw badRequest('Only a FINDING or EVIDENCE_REQUEST can be turned into a finding');
        }
        const existing = await tdb.finding.findFirst({
            where: { tenantId: ctx.tenantId, sourceKind: AUDITOR_SHARE_COMMENT_SOURCE, sourceRef: commentId, deletedAt: null },
            select: { id: true },
        });
        const pack = await tdb.auditPack.findFirst({ where: { id: packId, tenantId: ctx.tenantId }, select: { auditCycleId: true } });
        const audit = pack
            ? await tdb.audit.findFirst({ where: { tenantId: ctx.tenantId, auditCycleId: pack.auditCycleId, deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } })
            : null;
        let controlId: string | null = null;
        if (comment.auditPackItemId) {
            const item = await tdb.auditPackItem.findFirst({ where: { id: comment.auditPackItemId, tenantId: ctx.tenantId }, select: { entityType: true, entityId: true } });
            if (item?.entityType === 'CONTROL') controlId = item.entityId;
        }
        return { comment, existingFindingId: existing?.id ?? null, auditId: audit?.id ?? null, controlId };
    });

    const markResolved = (findingId: string) =>
        runInTenantContext(ctx, async (tdb) => {
            await tdb.auditPackShareComment.update({
                where: { id: commentId },
                data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedByUserId: ctx.userId },
            });
            await logEvent(tdb, ctx, {
                action: 'AUDIT_SHARE_COMMENT_MATERIALIZED',
                entityType: 'AuditPackShareComment',
                entityId: commentId,
                details: `Auditor ${loaded.comment.kind} → Finding ${findingId}`,
                detailsJson: { category: 'entity_lifecycle', operation: 'created', entityName: 'Finding', after: { findingId }, summary: `Auditor ${loaded.comment.kind} materialised into finding ${findingId}` },
            });
        });

    // Already materialised — ensure the comment is resolved, return the link.
    if (loaded.existingFindingId) {
        await markResolved(loaded.existingFindingId);
        return { findingId: loaded.existingFindingId, alreadyExisted: true };
    }

    const body = loaded.comment.body ?? '';
    const short = body.length > 120 ? `${body.slice(0, 117)}…` : (body || `Auditor ${loaded.comment.kind}`);
    const findingType = loaded.comment.kind === 'FINDING' ? 'NONCONFORMITY' : 'OBSERVATION';

    const finding = await createFinding(ctx, {
        auditId: loaded.auditId,
        controlId: loaded.controlId,
        severity: 'MEDIUM',
        type: findingType,
        title: short,
        description: body || undefined,
        sourceKind: AUDITOR_SHARE_COMMENT_SOURCE,
        sourceRef: commentId,
    });

    await createTask(ctx, {
        title: `Remediate auditor ${loaded.comment.kind === 'FINDING' ? 'finding' : 'request'}: ${short}`,
        type: 'AUDIT_FINDING',
        description: body || undefined,
        severity: 'MEDIUM',
        source: 'AUDIT',
        findingId: finding.id,
        ...(loaded.controlId ? { controlId: loaded.controlId } : {}),
        metadataJson: { findingId: finding.id, auditId: loaded.auditId, shareCommentId: commentId },
    });

    await markResolved(finding.id);
    return { findingId: finding.id, alreadyExisted: false };
}

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ Auditor Accounts РІвЂќР‚РІвЂќР‚РІвЂќР‚

export async function inviteAuditor(ctx: RequestContext, email: string, name?: string) {
    assertCanManageAuditors(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const emailHash = hashForLookup(email);
        const auditor = await tdb.auditorAccount.upsert({
            where: { tenantId_emailHash: { tenantId: ctx.tenantId, emailHash } },
            create: { tenantId: ctx.tenantId, email, emailHash, name, status: 'INVITED' },
            update: { name, status: 'ACTIVE' },
        });
        await logEvent(tdb, ctx, { action: 'AUDITOR_INVITED', entityType: 'AuditorAccount', entityId: auditor.id, details: JSON.stringify({ email }), detailsJson: { category: 'access', operation: 'permission_changed', targetUserId: auditor.id, detail: `Auditor invited: ${email}` } });
        return auditor;
    });
}

export async function grantAuditorAccess(ctx: RequestContext, auditorId: string, packId: string) {
    assertCanManageAuditors(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const auditor = await tdb.auditorAccount.findFirst({ where: { id: auditorId, tenantId: ctx.tenantId } });
        if (!auditor) throw notFound('Auditor not found');
        const pack = await tdb.auditPack.findFirst({ where: { id: packId, tenantId: ctx.tenantId } });
        if (!pack) throw notFound('Pack not found');

        try {
            await tdb.auditorPackAccess.create({ data: { tenantId: ctx.tenantId, auditorId, auditPackId: packId } });
        } catch { throw badRequest('Auditor already has access to this pack'); }

        await logEvent(tdb, ctx, { action: 'AUDITOR_GRANTED', entityType: 'AuditorPackAccess', entityId: `${auditorId}_${packId}`, details: JSON.stringify({ email: auditor.email }), detailsJson: { category: 'access', operation: 'permission_changed', targetUserId: auditorId, detail: `Auditor granted access to pack ${packId}` } });
        return { granted: true };
    });
}

export async function revokeAuditorAccess(ctx: RequestContext, auditorId: string, packId: string) {
    assertCanManageAuditors(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        await tdb.auditorPackAccess.deleteMany({ where: { auditorId, auditPackId: packId } });
        await logEvent(tdb, ctx, { action: 'AUDITOR_REVOKED', entityType: 'AuditorPackAccess', entityId: `${auditorId}_${packId}`, details: 'Auditor access revoked', detailsJson: { category: 'access', operation: 'permission_changed', targetUserId: auditorId, detail: `Auditor access revoked from pack ${packId}` } });
        return { revoked: true };
    });
}

// ─── Auditor / Share Readers (management UI) ───

export interface AuditorPackAccessRef {
    auditPackId: string;
    grantedAt: Date;
}

export interface AuditorSummary {
    id: string;
    email: string;
    name: string | null;
    status: 'INVITED' | 'ACTIVE' | 'REVOKED';
    createdAt: Date;
    packAccess: AuditorPackAccessRef[];
}

/**
 * Tenant read — every named auditor account for the tenant plus the
 * packs each currently has access to. `email` / `name` decrypt
 * transparently via the Epic B middleware. Backs the auditor-management
 * admin surface (`/audits/auditors`).
 */
export async function listAuditors(ctx: RequestContext): Promise<AuditorSummary[]> {
    assertCanManageAuditors(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const rows = await tdb.auditorAccount.findMany({
            where: { tenantId: ctx.tenantId },
            orderBy: { createdAt: 'desc' },
            include: { packAccess: { select: { auditPackId: true, grantedAt: true } } },
            take: 500,
        });
        return rows.map((a) => ({
            id: a.id,
            email: a.email,
            name: a.name ?? null,
            status: a.status as AuditorSummary['status'],
            createdAt: a.createdAt,
            packAccess: a.packAccess.map((p) => ({ auditPackId: p.auditPackId, grantedAt: p.grantedAt })),
        }));
    });
}

export interface PackShareRow {
    id: string;
    createdAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdByUserId: string;
}

/**
 * Tenant read — the share links minted for a pack (active + revoked),
 * newest first. Token hashes are never returned; the raw token is only
 * ever surfaced once, at creation time, by `generateShareLink`.
 */
export async function listPackShares(ctx: RequestContext, packId: string): Promise<PackShareRow[]> {
    assertCanSharePack(ctx);
    return runInTenantContext(ctx, async (tdb) => {
        const pack = await tdb.auditPack.findFirst({ where: { id: packId, tenantId: ctx.tenantId }, select: { id: true } });
        if (!pack) throw notFound('Audit pack not found');
        const rows = await tdb.auditPackShare.findMany({
            where: { tenantId: ctx.tenantId, auditPackId: packId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, createdAt: true, expiresAt: true, revokedAt: true, createdByUserId: true },
            take: 200,
        });
        return rows;
    });
}

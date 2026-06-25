/**
 * Audit Readiness — Share Links, Tokens, Auditor Access
 */
import { RequestContext } from '../../types';
import {
    assertCanSharePack, assertCanManageAuditors,
} from '../../policies/audit-readiness.policies';
import { logEvent } from '../../events/audit';
import { runInTenantContext, runInGlobalContext } from '@/lib/db-context';
import { notFound, badRequest, forbidden } from '@/lib/errors/types';
import { hashForLookup } from '@/lib/security/encryption';
import { recordAuditPackShared } from '@/lib/observability/business-metrics';
import crypto from 'crypto';

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

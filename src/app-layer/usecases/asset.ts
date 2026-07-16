import { RequestContext } from '../types';
import { AssetRepository, AssetListParams, AssetFilters } from '../repositories/AssetRepository';
import { WorkItemRepository } from '../repositories/WorkItemRepository';
import type { TaskLinkEntityType, AssetType } from '@prisma/client';
import { assertCanRead, assertCanWrite, assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext, type PrismaTx } from '@/lib/db-context';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { bumpEntityCacheVersion } from '@/lib/cache/list-cache';
import { createAssignmentNotification } from '../notifications/assignment';
import { logger } from '@/lib/observability';
import { criticalityToEnum } from '@/lib/asset-criticality';

export async function listAssets(ctx: RequestContext, filters?: AssetFilters) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rows = await AssetRepository.list(db, ctx, filters);
        const ids = rows.map((r: { id: string }) => r.id);
        // B7 — attach unified linked-task counts (TaskLink ASSET) so the
        // list page can show a Tasks column, matching Controls.
        // …and a per-asset OPEN-vulnerability rollup (count + top severity) so
        // the list surfaces a vuln signal that deep-links to the filtered global
        // Vulnerabilities view. Both are batched over the ≤100 listed ids — no
        // per-row reads.
        const [counts, vulnGroups, topVulns] = await Promise.all([
            WorkItemRepository.countLinkedToEntities(db, ctx, 'ASSET' as TaskLinkEntityType, ids),
            ids.length
                ? db.assetVulnerability.groupBy({
                      by: ['assetId'],
                      where: { tenantId: ctx.tenantId, assetId: { in: ids }, status: 'OPEN' },
                      _count: { _all: true },
                  })
                : Promise.resolve([] as { assetId: string; _count: { _all: number } }[]),
            ids.length
                ? db.assetVulnerability.findMany({ // guardrail-allow: unbounded — bounded by assetId in-list; `distinct` yields ≤1 row per listed asset (≤100).
                      where: { tenantId: ctx.tenantId, assetId: { in: ids }, status: 'OPEN' },
                      distinct: ['assetId'],
                      orderBy: [{ assetId: 'asc' }, { cve: { cvssScore: 'desc' } }],
                      select: { assetId: true, cve: { select: { cvssSeverity: true } } },
                  })
                : Promise.resolve([] as { assetId: string; cve: { cvssSeverity: string | null } | null }[]),
        ]);
        const openVulnByAsset = new Map(vulnGroups.map((g) => [g.assetId, g._count._all]));
        const topSevByAsset = new Map(topVulns.map((v) => [v.assetId, v.cve?.cvssSeverity ?? null]));
        return rows.map((r) => ({
            ...r,
            taskTotal: counts.get(r.id)?.total ?? 0,
            taskDone: counts.get(r.id)?.done ?? 0,
            openVulnCount: openVulnByAsset.get(r.id) ?? 0,
            maxVulnSeverity: topSevByAsset.get(r.id) ?? null,
        }));
    });
}

export async function listAssetsPaginated(ctx: RequestContext, params: AssetListParams) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        AssetRepository.listPaginated(db, ctx, params)
    );
}

export interface AssetRollups {
    risks: { count: number };
    controls: { count: number };
    vulnerabilities: { openCount: number; maxSeverity: string | null; maxScore: number | null };
    tasks: { openCount: number; total: number };
}

/**
 * 360° relationship roll-ups for the asset-detail Overview band. Every
 * aggregate is a bounded single query (count / findFirst) fanned out with
 * Promise.all — no reads-in-a-loop, no unbounded findMany. The OPEN-vuln
 * severity is the CVSS severity of the highest-scoring OPEN vulnerability.
 */
async function computeAssetRollups(
    db: PrismaTx,
    ctx: RequestContext,
    assetId: string,
): Promise<AssetRollups> {
    const [riskCount, controlCount, openVulnCount, topOpenVuln, taskCounts] = await Promise.all([
        db.assetRiskLink.count({ where: { tenantId: ctx.tenantId, assetId } }),
        db.controlAsset.count({ where: { tenantId: ctx.tenantId, assetId } }),
        db.assetVulnerability.count({ where: { tenantId: ctx.tenantId, assetId, status: 'OPEN' } }),
        db.assetVulnerability.findFirst({
            where: { tenantId: ctx.tenantId, assetId, status: 'OPEN' },
            orderBy: [{ cve: { cvssScore: 'desc' } }],
            select: { cve: { select: { cvssSeverity: true, cvssScore: true } } },
        }),
        WorkItemRepository.countLinkedToEntities(db, ctx, 'ASSET' as TaskLinkEntityType, [assetId]),
    ]);
    const tc = taskCounts.get(assetId) ?? { total: 0, done: 0 };
    return {
        risks: { count: riskCount },
        controls: { count: controlCount },
        vulnerabilities: {
            openCount: openVulnCount,
            maxSeverity: topOpenVuln?.cve?.cvssSeverity ?? null,
            maxScore: topOpenVuln?.cve?.cvssScore ?? null,
        },
        tasks: { openCount: tc.total - tc.done, total: tc.total },
    };
}

export async function getAsset(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const asset = await AssetRepository.getById(db, ctx, id);
        if (!asset) throw notFound('Asset not found');
        const rollups = await computeAssetRollups(db, ctx, id);
        return { ...asset, rollups };
    });
}

/**
 * Asset activity trail — the tenant's audit-log entries for THIS asset,
 * newest first. Mirrors `getControlActivity`: bounded with `take:`, joins
 * the actor's display name, RLS-scoped via `runInTenantContext`. Asset
 * mutations (CREATE / UPDATE / SOFT_DELETE / evidence link-unlink) log with
 * `entity: 'Asset'`, so this feed reflects them without extra wiring.
 */
export async function getAssetActivity(ctx: RequestContext, assetId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const asset = await AssetRepository.getById(db, ctx, assetId);
        if (!asset) throw notFound('Asset not found');
        return db.auditLog.findMany({
            where: { tenantId: ctx.tenantId, entity: 'Asset', entityId: assetId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { user: { select: { id: true, name: true } } },
        });
    });
}

// Asset create/update input — mirrors CreateAssetSchema/UpdateAssetSchema, but
// written by hand because those schemas use `z.coerce` (input type `unknown`) and
// the usecase is also called directly in tests before the write gate. `type` is
// optional so the permission-gate test path (which throws before validation) holds.
interface CreateAssetInput {
    name: string;
    type?: string;
    status?: 'ACTIVE' | 'RETIRED';
    classification?: string | null;
    owner?: string | null;
    ownerUserId?: string | null;
    location?: string | null;
    confidentiality?: number;
    integrity?: number;
    availability?: number;
    dependencies?: string | null;
    businessProcesses?: string | null;
    dataResidency?: string | null;
    retention?: string | null;
    // External-system reference (CMDB id, ticket key, …).
    externalRef?: string | null;
    // Product-identity fields — power CVE→asset matching.
    cpe?: string | null;
    vendor?: string | null;
    product?: string | null;
    version?: string | null;
}
type UpdateAssetInput = Partial<CreateAssetInput>;

export async function createAsset(ctx: RequestContext, data: CreateAssetInput) {
    assertCanWrite(ctx);

    // Derive-on-write — the stored `Asset.criticality` enum is the single
    // source of truth read by the KPI, the filter, and the detail chip. Any
    // undefined C/I/A dimension defaults to 3 (the column default), so the
    // persisted level matches the badge the UI derives from the same triad.
    const createC = data.confidentiality ?? 3;
    const createI = data.integrity ?? 3;
    const createA = data.availability ?? 3;

    return runInTenantContext(ctx, async (db) => {
        const asset = await AssetRepository.create(db, ctx, {
            name: data.name,
            type: data.type as AssetType,
            ...(data.status ? { status: data.status } : {}),
            classification: data.classification,
            owner: data.owner,
            ownerUserId: data.ownerUserId || null,
            location: data.location,
            confidentiality: data.confidentiality,
            integrity: data.integrity,
            availability: data.availability,
            criticality: criticalityToEnum(createC, createI, createA),
            dependencies: data.dependencies,
            businessProcesses: data.businessProcesses,
            dataResidency: data.dataResidency,
            retention: data.retention,
            externalRef: data.externalRef,
            cpe: data.cpe,
            vendor: data.vendor,
            product: data.product,
            version: data.version,
        });

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Asset',
            entityId: asset.id,
            details: `Created asset: ${asset.name}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Asset',
                operation: 'created',
                after: { name: asset.name, type: data.type, classification: data.classification },
                summary: `Created asset: ${asset.name}`,
            },
        });

        return asset;
    });
}

export async function updateAsset(ctx: RequestContext, id: string, data: UpdateAssetInput) {
    assertCanWrite(ctx);

    const { asset: updated, previousOwnerId } = await runInTenantContext(ctx, async (db) => {
        // Capture the prior assignee so the notification only fires on
        // an actual change, not on every unrelated asset edit.
        const before = await AssetRepository.getById(db, ctx, id);
        const previousOwnerId = before?.ownerUserId ?? null;

        // Re-derive the stored criticality from the effective C/I/A triad
        // (this-edit value ?? prior value ?? default 3). Always recomputing
        // — even on a status-only PATCH — self-heals rows whose stored enum
        // predates derive-on-write, and keeps it agreeing with the badge.
        const updC = data.confidentiality ?? before?.confidentiality ?? 3;
        const updI = data.integrity ?? before?.integrity ?? 3;
        const updA = data.availability ?? before?.availability ?? 3;

        const asset = await AssetRepository.update(db, ctx, id, {
            name: data.name,
            type: data.type as AssetType | undefined,
            classification: data.classification,
            owner: data.owner,
            // "Assigned to" — undefined leaves it untouched; '' or null
            // clears (an empty string would be an invalid FK).
            ownerUserId:
                data.ownerUserId === undefined
                    ? undefined
                    : data.ownerUserId || null,
            location: data.location,
            confidentiality: data.confidentiality,
            integrity: data.integrity,
            availability: data.availability,
            criticality: criticalityToEnum(updC, updI, updA),
            dependencies: data.dependencies,
            businessProcesses: data.businessProcesses,
            dataResidency: data.dataResidency,
            retention: data.retention,
            externalRef: data.externalRef,
            cpe: data.cpe,
            vendor: data.vendor,
            product: data.product,
            version: data.version,
        });

        if (!asset) throw notFound('Asset not found');

        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'Asset',
            entityId: id,
            details: `Asset updated`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Asset',
                operation: 'updated',
                changedFields: Object.keys(data).filter(k => (data as unknown as Record<string, unknown>)[k] !== undefined),
                after: { name: data.name, type: data.type, classification: data.classification },
                summary: `Asset updated`,
            },
        });

        return { asset, previousOwnerId };
    });

    // In-app ASSET_ASSIGNED bell notification for the new owner — only
    // when the assignee actually changed to a real user. After-commit,
    // own short transaction, fire-and-forget, day-granular dedupe.
    const newOwnerId = updated.ownerUserId ?? null;
    if (newOwnerId && newOwnerId !== previousOwnerId && ctx.tenantSlug) {
        const tenantSlug = ctx.tenantSlug;
        try {
            await runInTenantContext(ctx, (db) =>
                createAssignmentNotification(db, 'ASSET_ASSIGNED', {
                    tenantId: ctx.tenantId,
                    assigneeUserId: newOwnerId,
                    entityId: id,
                    entityLabel: updated.name ?? '(untitled)',
                    entityKey: null,
                    tenantSlug,
                }),
            );
        } catch (err) {
            logger.warn('failed to create asset-assigned notification', {
                component: 'notifications',
                assetId: id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return updated;
}

// ─── Bulk import (CSV → one request) ───

export interface AssetImportResult {
    created: number;
    skipped: number;
    createdIds: string[];
    errors: { row: number; name: string; message: string }[];
}

/**
 * Bulk-create assets from a parsed CSV in ONE request (replacing N sequential
 * client POSTs). Two honesty fixes over the old per-row POST loop:
 *
 *   • **Dedupe by name.** Rows whose (case-insensitive) name already exists in
 *     the tenant — or repeats earlier in the same batch — are skipped, not
 *     blindly re-created. Re-importing the same CSV is now idempotent.
 *   • **Owner resolution.** A free-text `owner` cell is resolved to a real
 *     `ownerUserId` against the tenant roster (by member name OR email,
 *     case-insensitive). On a match the assignee is set and the free-text is
 *     dropped; with no match the free-text is kept as a clearly-secondary
 *     fallback. `criticality` is NOT taken from the CSV — createAsset derives
 *     it from the CIA triad (the single source of truth).
 *
 * Each row is created through `createAsset`, so it inherits derive-on-write
 * criticality, the per-asset CREATE audit entry, and key minting. Per-row
 * errors are isolated (one bad row never rolls back the good ones).
 */
export async function bulkImportAssets(
    ctx: RequestContext,
    rows: CreateAssetInput[],
): Promise<AssetImportResult> {
    assertCanWrite(ctx);

    // One up-front read pass: the existing-name set (dedupe) + the member
    // roster (owner resolution). Everything else is in-memory.
    const { existingNames, ownerByKey } = await runInTenantContext(ctx, async (db) => {
        const existing = await db.asset.findMany({ // guardrail-allow: unbounded — dedupe needs the full tenant name set; selects `name` only (tiny rows).
            where: { tenantId: ctx.tenantId },
            select: { name: true },
        });
        const members = await db.tenantMembership.findMany({
            where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
            select: { userId: true, user: { select: { name: true, email: true } } },
        });
        const ownerByKey = new Map<string, string>();
        for (const m of members) {
            const name = m.user?.name?.trim().toLowerCase();
            const email = m.user?.email?.trim().toLowerCase();
            if (name) ownerByKey.set(name, m.userId);
            if (email) ownerByKey.set(email, m.userId);
        }
        return { existingNames: existing.map((a: { name: string }) => a.name), ownerByKey };
    });

    const seen = new Set(existingNames.map((n) => n.trim().toLowerCase()));
    const result: AssetImportResult = { created: 0, skipped: 0, createdIds: [], errors: [] };

    let i = 0;
    for (const row of rows) {
        i += 1;
        const nameLc = row.name?.trim().toLowerCase() ?? '';
        if (!nameLc) {
            result.errors.push({ row: i, name: row.name ?? '', message: 'Name is required' });
            continue;
        }
        if (seen.has(nameLc)) {
            result.skipped += 1;
            continue;
        }
        seen.add(nameLc);

        // Resolve a free-text owner to a real member; keep free-text only as a
        // fallback when it matches no one.
        let ownerUserId = row.ownerUserId ?? null;
        let owner = row.owner ?? null;
        if (!ownerUserId && owner) {
            const match = ownerByKey.get(owner.trim().toLowerCase());
            if (match) {
                ownerUserId = match;
                owner = null;
            }
        }

        try {
            const asset = await createAsset(ctx, { ...row, owner: owner ?? undefined, ownerUserId });
            result.created += 1;
            result.createdIds.push(asset.id);
        } catch (e) {
            result.errors.push({ row: i, name: row.name, message: e instanceof Error ? e.message : String(e) });
        }
    }

    return result;
}

// ─── Bulk actions (canonical BulkActionBar — asset rollout) ───
//
// Follow the Tasks bulk pattern: assert write, fetch the affected rows once
// (audit source + no per-id reads in a loop), one tenant-scoped `updateMany`,
// a per-row audit entry, then bump the list cache.

/** Bulk-set status (ACTIVE / RETIRED) on the given assets. */
export async function bulkSetAssetStatus(
    ctx: RequestContext,
    assetIds: string[],
    status: 'ACTIVE' | 'RETIRED',
) {
    assertCanWrite(ctx);
    const updated = await runInTenantContext(ctx, async (db) => {
        const rows = await AssetRepository.listByIds(db, ctx, assetIds);
        if (rows.length === 0) return 0;
        await AssetRepository.bulkUpdate(db, ctx, assetIds, { status });
        for (const r of rows) {
            await logEvent(db, ctx, {
                action: 'UPDATE',
                entityType: 'Asset',
                entityId: r.id,
                details: `Asset status set to ${status}`,
                detailsJson: {
                    category: 'entity_lifecycle',
                    entityName: 'Asset',
                    operation: 'updated',
                    changedFields: ['status'],
                    after: { status },
                    summary: `status set to ${status} (bulk)`,
                },
            });
        }
        return rows.length;
    });
    // Assets use React Query on the client; AssetsClient invalidates its list
    // query after the bulk mutation. No server-side SWR cache to bump.
    return { updated };
}

/** Bulk-assign an owner (ownerUserId; null = unassign) to the given assets. */
export async function bulkAssignAsset(
    ctx: RequestContext,
    assetIds: string[],
    ownerUserId: string | null,
) {
    assertCanWrite(ctx);
    const updated = await runInTenantContext(ctx, async (db) => {
        const rows = await AssetRepository.listByIds(db, ctx, assetIds);
        if (rows.length === 0) return 0;
        await AssetRepository.bulkUpdate(db, ctx, assetIds, {
            ownerUserId: ownerUserId || null,
        });
        for (const r of rows) {
            await logEvent(db, ctx, {
                action: 'UPDATE',
                entityType: 'Asset',
                entityId: r.id,
                details: ownerUserId
                    ? `Asset owner reassigned`
                    : `Asset owner cleared`,
                detailsJson: {
                    category: 'entity_lifecycle',
                    entityName: 'Asset',
                    operation: 'updated',
                    changedFields: ['ownerUserId'],
                    after: { ownerUserId: ownerUserId || null },
                    summary: ownerUserId
                        ? `owner reassigned (bulk)`
                        : `owner cleared (bulk)`,
                },
            });
        }
        return rows.length;
    });
    // Assets use React Query on the client; AssetsClient invalidates its list
    // query after the bulk mutation. No server-side SWR cache to bump.
    return { updated };
}

/** Bulk soft-delete assets selected in the table action bar. */
export async function bulkDeleteAsset(ctx: RequestContext, assetIds: string[]) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rows = await AssetRepository.listByIds(db, ctx, assetIds);
        if (rows.length === 0) return { deleted: 0 };
        await db.asset.deleteMany({ where: { id: { in: rows.map((r) => r.id) }, tenantId: ctx.tenantId } });
        for (const r of rows) {
            await logEvent(db, ctx, {
                action: 'SOFT_DELETE',
                entityType: 'Asset',
                entityId: r.id,
                details: 'Asset soft-deleted (bulk)',
                detailsJson: { category: 'entity_lifecycle', entityName: 'Asset', operation: 'deleted', summary: 'Asset soft-deleted' },
            });
        }
        return { deleted: rows.length };
    });
}

export async function deleteAsset(ctx: RequestContext, id: string) {
    assertCanAdmin(ctx);

    return runInTenantContext(ctx, async (db) => {
        const deleted = await AssetRepository.delete(db, ctx, id);
        if (!deleted) throw notFound('Asset not found');

        await logEvent(db, ctx, {
            action: 'SOFT_DELETE',
            entityType: 'Asset',
            entityId: id,
            details: 'Asset soft-deleted',
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Asset',
                operation: 'deleted',
                summary: 'Asset soft-deleted',
            },
        });

        return { success: true };
    });
}

// ─── Restore / Purge / Include Deleted ───

import { restoreEntity, purgeEntity } from './soft-delete-operations';
import { withDeleted } from '@/lib/soft-delete';

export async function restoreAsset(ctx: RequestContext, id: string) {
    return restoreEntity(ctx, 'Asset', id);
}

export async function purgeAsset(ctx: RequestContext, id: string) {
    return purgeEntity(ctx, 'Asset', id);
}

export async function listAssetsWithDeleted(ctx: RequestContext) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, (db) =>
        db.asset.findMany(withDeleted({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' as const } }))
    );
}

// ─── Attached Evidence ───
//
// Evidence attached directly to an asset via `Evidence.assetId` — same
// pattern as Control/Task/Risk. The asset Evidence tab renders this
// through the shared <EvidenceSubTable> ({ links, evidence } shape;
// `links` always empty). Distinct from the read-only INHERITED evidence
// (aggregated from the asset's mapped controls), shown in its own
// section.

/** Asset attached-evidence payload — `{ links, evidence }` for the shared sub-table. */
export async function getAssetEvidenceTab(ctx: RequestContext, assetId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const asset = await db.asset.findFirst({
            where: { id: assetId, tenantId: ctx.tenantId },
            select: { id: true },
        });
        if (!asset) throw notFound('Asset not found');
        const evidence = await db.evidence.findMany({
            where: { assetId, tenantId: ctx.tenantId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
        });
        return { links: [], evidence };
    });
}

/** Attach a URL as evidence on an asset (file uploads go through /evidence/uploads with an assetId). */
export async function linkAssetEvidence(
    ctx: RequestContext,
    assetId: string,
    data: { url: string; note?: string | null },
) {
    assertCanWrite(ctx);
    const url = data.url.trim();
    const note = data.note ? sanitizePlainText(data.note) : null;
    const result = await runInTenantContext(ctx, async (db) => {
        const asset = await db.asset.findFirst({
            where: { id: assetId, tenantId: ctx.tenantId },
            select: { id: true },
        });
        if (!asset) throw notFound('Asset not found');
        const evidence = await db.evidence.create({
            data: {
                tenantId: ctx.tenantId,
                assetId,
                type: 'LINK',
                title: note || url,
                content: url,
                status: 'DRAFT',
                ownerUserId: ctx.userId,
            },
        });
        await logEvent(db, ctx, {
            action: 'ASSET_EVIDENCE_LINKED',
            entityType: 'Asset',
            entityId: assetId,
            details: `Evidence linked: ${url}`,
            detailsJson: { category: 'relationship', operation: 'linked', sourceEntity: 'Asset', sourceId: assetId, targetEntity: 'Evidence', targetId: evidence.id, relation: 'LINK' },
        });
        return evidence;
    });
    await bumpEntityCacheVersion(ctx, 'evidence');
    return result;
}

/** Detach evidence from an asset — clears `Evidence.assetId`; the evidence survives in the library. */
export async function unlinkAssetEvidence(
    ctx: RequestContext,
    assetId: string,
    evidenceId: string,
) {
    assertCanWrite(ctx);
    const outcome = await runInTenantContext(ctx, async (db) => {
        const evidence = await db.evidence.findFirst({
            where: { id: evidenceId, assetId, tenantId: ctx.tenantId },
            select: { id: true },
        });
        if (!evidence) throw notFound('Asset evidence not found');
        await db.evidence.update({
            where: { id: evidenceId },
            data: { assetId: null },
        });
        await logEvent(db, ctx, {
            action: 'ASSET_EVIDENCE_UNLINKED',
            entityType: 'Asset',
            entityId: assetId,
            details: `Evidence unlinked: ${evidenceId}`,
            detailsJson: { category: 'relationship', operation: 'unlinked', sourceEntity: 'Asset', sourceId: assetId, targetEntity: 'Evidence', targetId: evidenceId },
        });
        return { success: true };
    });
    await bumpEntityCacheVersion(ctx, 'evidence');
    return outcome;
}

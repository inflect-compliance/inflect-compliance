import { RequestContext } from '../types';
import { AssetRepository, AssetListParams, AssetFilters } from '../repositories/AssetRepository';
import { WorkItemRepository } from '../repositories/WorkItemRepository';
import type { TaskLinkEntityType, AssetType } from '@prisma/client';
import { assertCanRead, assertCanWrite, assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { bumpEntityCacheVersion } from '@/lib/cache/list-cache';
import { createAssignmentNotification } from '../notifications/assignment';
import { logger } from '@/lib/observability';

export async function listAssets(ctx: RequestContext, filters?: AssetFilters) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rows = await AssetRepository.list(db, ctx, filters);
        // B7 — attach unified linked-task counts (TaskLink ASSET) so the
        // list page can show a Tasks column, matching Controls.
        const counts = await WorkItemRepository.countLinkedToEntities(
            db,
            ctx,
            'ASSET' as TaskLinkEntityType,
            rows.map((r: { id: string }) => r.id),
        );
        return rows.map((r) => ({
            ...r,
            taskTotal: counts.get(r.id)?.total ?? 0,
            taskDone: counts.get(r.id)?.done ?? 0,
        }));
    });
}

export async function listAssetsPaginated(ctx: RequestContext, params: AssetListParams) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        AssetRepository.listPaginated(db, ctx, params)
    );
}

export async function getAsset(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const asset = await AssetRepository.getById(db, ctx, id);
        if (!asset) throw notFound('Asset not found');
        return asset;
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
    classification?: string;
    owner?: string;
    ownerUserId?: string | null;
    location?: string;
    confidentiality?: number;
    integrity?: number;
    availability?: number;
    dependencies?: string | null;
    businessProcesses?: string | null;
    dataResidency?: string | null;
    retention?: string | null;
}
type UpdateAssetInput = Partial<CreateAssetInput>;

export async function createAsset(ctx: RequestContext, data: CreateAssetInput) {
    assertCanWrite(ctx);

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
            dependencies: data.dependencies,
            businessProcesses: data.businessProcesses,
            dataResidency: data.dataResidency,
            retention: data.retention,
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
            dependencies: data.dependencies,
            businessProcesses: data.businessProcesses,
            dataResidency: data.dataResidency,
            retention: data.retention,
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

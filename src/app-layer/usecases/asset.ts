import { RequestContext } from '../types';
import { AssetRepository, AssetListParams, AssetFilters } from '../repositories/AssetRepository';
import { assertCanRead, assertCanWrite, assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import { createAssignmentNotification } from '../notifications/assignment';
import { logger } from '@/lib/observability';

export async function listAssets(ctx: RequestContext, filters?: AssetFilters) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        AssetRepository.list(db, ctx, filters)
    );
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createAsset(ctx: RequestContext, data: any) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const asset = await AssetRepository.create(db, ctx, {
            name: data.name,
            type: data.type,
            classification: data.classification,
            owner: data.owner,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateAsset(ctx: RequestContext, id: string, data: any) {
    assertCanWrite(ctx);

    const { asset: updated, previousOwnerId } = await runInTenantContext(ctx, async (db) => {
        // Capture the prior assignee so the notification only fires on
        // an actual change, not on every unrelated asset edit.
        const before = await AssetRepository.getById(db, ctx, id);
        const previousOwnerId = before?.ownerUserId ?? null;

        const asset = await AssetRepository.update(db, ctx, id, {
            name: data.name,
            type: data.type,
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
                changedFields: Object.keys(data).filter(k => data[k] !== undefined),
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

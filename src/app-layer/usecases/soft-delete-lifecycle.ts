/**
 * Soft-Delete Lifecycle Usecases
 *
 * Provides restore and purge capabilities for soft-deleted records.
 *
 * Architecture:
 *   - restore(): clears deletedAt / deletedByUserId — record becomes visible again
 *   - purge(): hard-deletes the record — admin/system use only
 *   - Both require the record to already be soft-deleted (safety guard)
 *   - Tenant isolation enforced via withTenantDb / runInTenantContext
 *
 * SECURITY:
 *   - purge is destructive — caller must enforce admin-only access
 *   - restore is less sensitive but still requires appropriate permissions
 */
import { SOFT_DELETE_MODELS, withDeleted } from '@/lib/soft-delete';
import { badRequest, notFound } from '@/lib/errors/types';
import type { PrismaTx } from '@/lib/db-context';

// Structural shape of the runtime-selected Prisma model delegate. The
// model is chosen by string at runtime, so payloads are `unknown`; the
// only typed read is the soft-delete existence check (`{ id } | null`).
interface SoftDeleteDelegate {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    findMany(args: unknown): Promise<unknown[]>;
    update(args: unknown): Promise<unknown>;
}



interface SoftDeleteLifecycleInput {
    model: string;
    id: string;
    actorUserId?: string;
}

/**
 * Restore a soft-deleted record by clearing deletedAt and deletedByUserId.
 *
 * @throws Error if model doesn't support soft-delete or record not found/not deleted
 */
export async function restoreSoftDeleted(
    tx: PrismaTx,
    input: SoftDeleteLifecycleInput,
): Promise<{ id: string; model: string; restoredAt: Date }> {
    const { model, id } = input;

    if (!SOFT_DELETE_MODELS.has(model)) {
        throw badRequest(`Model "${model}" does not support soft-delete`);
    }

    const delegate = getDelegate(tx, model);

    // Find the soft-deleted record (must use withDeleted to see it)
    const existing = await delegate.findFirst(withDeleted({
        where: { id, deletedAt: { not: null } },
    }));

    if (!existing) {
        throw notFound(`No soft-deleted ${model} found with id "${id}"`);
    }

    // Clear soft-delete fields
    await delegate.update({
        where: { id },
        data: {
            deletedAt: null,
            deletedByUserId: null,
        },
    });

    return { id, model, restoredAt: new Date() };
}

/**
 * Permanently hard-delete a soft-deleted record.
 *
 * DANGER: This is irreversible. Caller must enforce admin-only access.
 *
 * @throws Error if model doesn't support soft-delete or record not found/not deleted
 */
export async function purgeSoftDeleted(
    tx: PrismaTx,
    input: SoftDeleteLifecycleInput,
): Promise<{ id: string; model: string; purgedAt: Date }> {
    const { model, id } = input;

    if (!SOFT_DELETE_MODELS.has(model)) {
        throw badRequest(`Model "${model}" does not support soft-delete`);
    }

    const delegate = getDelegate(tx, model);

    // Verify it's actually soft-deleted before purging
    const existing = await delegate.findFirst(withDeleted({
        where: { id, deletedAt: { not: null } },
    }));

    if (!existing) {
        throw notFound(`No soft-deleted ${model} found with id "${id}". Only soft-deleted records can be purged.`);
    }

    // Hard delete via raw SQL to bypass the soft-delete middleware
    const tableName = model; // Prisma model names match table names
    await tx.$executeRawUnsafe(
        `DELETE FROM "${tableName}" WHERE "id" = $1`,
        id,
    );

    return { id, model, purgedAt: new Date() };
}

/**
 * List soft-deleted records for a model (admin view).
 */
export async function listSoftDeleted(
    tx: PrismaTx,
    model: string,
    tenantId: string,
    options?: { take?: number; skip?: number },
): Promise<unknown[]> {
    if (!SOFT_DELETE_MODELS.has(model)) {
        throw badRequest(`Model "${model}" does not support soft-delete`);
    }

    const delegate = getDelegate(tx, model);

    return delegate.findMany(withDeleted({
        where: {
            tenantId,
            deletedAt: { not: null },
        },
        orderBy: { deletedAt: 'desc' },
        take: options?.take ?? 50,
        skip: options?.skip ?? 0,
    }));
}

// ─── Helpers ────────────────────────────────────────────────────────

function getDelegate(tx: PrismaTx, model: string): SoftDeleteDelegate {
    const key = model.charAt(0).toLowerCase() + model.slice(1);
    const delegate = (tx as unknown as Record<string, SoftDeleteDelegate>)[key];
    if (!delegate) {
        throw badRequest(`Prisma delegate not found for model "${model}"`);
    }
    return delegate;
}

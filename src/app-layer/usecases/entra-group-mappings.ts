/**
 * EI-2 — CRUD for EntraGroupMapping (admin Settings → Identity → Groups).
 * Admin-gated; tenant-scoped via runInTenantContext (RLS). The provider FK is
 * resolved to the tenant's ENTRA_ID provider.
 */
import { RequestContext } from '../types';
import { assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { badRequest, notFound } from '@/lib/errors/types';
import { z } from 'zod';
import type { Role } from '@prisma/client';

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const CreateEntraGroupMappingSchema = z.object({
    aadGroupId: z.string().regex(GUID_RE, 'aadGroupId must be a GUID'),
    aadGroupName: z.string().optional(),
    icRole: z.enum(['OWNER', 'ADMIN', 'EDITOR', 'READER', 'AUDITOR']),
    customRoleId: z.string().nullable().optional(),
    priority: z.number().int().min(0).max(1000).default(0),
});

export const UpdateEntraGroupMappingSchema = z.object({
    aadGroupName: z.string().optional(),
    icRole: z.enum(['OWNER', 'ADMIN', 'EDITOR', 'READER', 'AUDITOR']).optional(),
    customRoleId: z.string().nullable().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    isActive: z.boolean().optional(),
});

export async function listEntraGroupMappings(ctx: RequestContext) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, (db) =>
        db.entraGroupMapping.findMany({
            where: { tenantId: ctx.tenantId },
            orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
            take: 500,
        }),
    );
}

export async function createEntraGroupMapping(ctx: RequestContext, raw: unknown) {
    assertCanAdmin(ctx);
    const input = CreateEntraGroupMappingSchema.parse(raw);
    return runInTenantContext(ctx, async (db) => {
        const provider = await db.tenantIdentityProvider.findFirst({
            where: { tenantId: ctx.tenantId, type: 'ENTRA_ID' },
            select: { id: true },
        });
        if (!provider) throw badRequest('Configure the Entra ID provider first');

        const mapping = await db.entraGroupMapping.create({
            data: {
                tenantId: ctx.tenantId,
                providerId: provider.id,
                aadGroupId: input.aadGroupId,
                aadGroupName: input.aadGroupName ?? null,
                icRole: input.icRole as Role,
                customRoleId: input.customRoleId ?? null,
                priority: input.priority,
            },
        });
        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'EntraGroupMapping',
            entityId: mapping.id,
            details: `Mapped Entra group ${input.aadGroupId} → ${input.icRole}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'EntraGroupMapping',
                operation: 'created',
                after: { aadGroupId: input.aadGroupId, icRole: input.icRole, priority: input.priority },
                summary: `Entra group mapping created`,
            },
        });
        return mapping;
    });
}

export async function updateEntraGroupMapping(ctx: RequestContext, id: string, raw: unknown) {
    assertCanAdmin(ctx);
    const input = UpdateEntraGroupMappingSchema.parse(raw);
    return runInTenantContext(ctx, async (db) => {
        const res = await db.entraGroupMapping.updateMany({
            where: { id, tenantId: ctx.tenantId },
            data: {
                ...(input.aadGroupName !== undefined ? { aadGroupName: input.aadGroupName } : {}),
                ...(input.icRole !== undefined ? { icRole: input.icRole as Role } : {}),
                ...(input.customRoleId !== undefined ? { customRoleId: input.customRoleId } : {}),
                ...(input.priority !== undefined ? { priority: input.priority } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            },
        });
        if (res.count === 0) throw notFound('Mapping not found');
        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'EntraGroupMapping',
            entityId: id,
            details: `Updated Entra group mapping`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'EntraGroupMapping',
                operation: 'updated',
                after: input,
                summary: 'Entra group mapping updated',
            },
        });
        return { id, ...input };
    });
}

/** Soft-delete — deactivates the mapping (isActive = false). */
export async function deleteEntraGroupMapping(ctx: RequestContext, id: string) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, async (db) => {
        const res = await db.entraGroupMapping.updateMany({
            where: { id, tenantId: ctx.tenantId },
            data: { isActive: false },
        });
        if (res.count === 0) throw notFound('Mapping not found');
        await logEvent(db, ctx, {
            action: 'DELETE',
            entityType: 'EntraGroupMapping',
            entityId: id,
            details: `Deactivated Entra group mapping`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'EntraGroupMapping',
                operation: 'deleted',
                summary: 'Entra group mapping deactivated',
            },
        });
        return { ok: true };
    });
}

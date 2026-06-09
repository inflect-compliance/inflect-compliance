/**
 * SP-3 — SharePoint delta-sync BullMQ jobs.
 *
 *   - `sharepoint-delta-sync`          — sync one connection (manual or scheduled).
 *   - `sharepoint-delta-sync-dispatch` — daily fan-out: enqueue a per-connection
 *     sync for every enabled SharePoint connection across all tenants.
 *
 * @module jobs/sharepoint-delta-sync
 */
import prisma from '@/lib/prisma';
import type { RequestContext } from '@/app-layer/types';
import { getPermissionsForRole } from '@/lib/permissions';
import { runSharePointDeltaSync } from '@/app-layer/integrations/providers/sharepoint/import';
import { enqueue } from './queue';
import { logger } from '@/lib/observability/logger';
import type { SharePointDeltaSyncPayload, SharePointDeltaSyncDispatchPayload } from './types';

/** Build a tenant RequestContext for a job actor (an active member). */
async function buildJobContext(tenantId: string, actorUserId: string): Promise<RequestContext> {
    const membership = await prisma.tenantMembership.findFirst({
        where: { userId: actorUserId, tenantId, status: 'ACTIVE' },
        select: { role: true },
    });
    if (!membership) {
        throw new Error(`sharepoint-delta-sync: user ${actorUserId} is not an active member of tenant ${tenantId}`);
    }
    const appPermissions = getPermissionsForRole(membership.role);
    return {
        requestId: `sharepoint-delta-sync-${tenantId}`,
        userId: actorUserId,
        tenantId,
        role: membership.role,
        permissions: {
            canRead: appPermissions.evidence.view,
            canWrite: appPermissions.evidence.upload,
            canAdmin: appPermissions.admin.manage,
            canAudit: appPermissions.audits.view,
            canExport: appPermissions.reports.export,
        },
        appPermissions,
    };
}

export async function runSharePointDeltaSyncJob(payload: SharePointDeltaSyncPayload) {
    const ctx = await buildJobContext(payload.tenantId, payload.actorUserId);
    if (!ctx.permissions.canWrite) {
        throw new Error(`sharepoint-delta-sync: actor lacks evidence.upload on tenant ${payload.tenantId}`);
    }
    return runSharePointDeltaSync(ctx, payload.connectionId);
}

/**
 * Fan-out: one delta-sync job per enabled SharePoint connection. Picks an
 * active OWNER/ADMIN of each tenant as the actor (re-imports need evidence
 * write). Connections with no eligible admin are skipped (logged).
 */
export async function runSharePointDeltaSyncDispatch(_payload: SharePointDeltaSyncDispatchPayload) {
    const connections = await prisma.integrationConnection.findMany({
        where: { provider: 'sharepoint', isEnabled: true },
        select: { id: true, tenantId: true },
        take: 1000,
    });

    // Hoist the actor lookup out of the per-connection loop (avoid N+1): one
    // query for all eligible admins, keyed to the oldest per tenant.
    const tenantIds = [...new Set(connections.map((c) => c.tenantId))];
    const admins = await prisma.tenantMembership.findMany({
        where: { tenantId: { in: tenantIds }, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
        select: { tenantId: true, userId: true },
        orderBy: { createdAt: 'asc' },
        take: 5000,
    });
    const adminByTenant = new Map<string, string>();
    for (const a of admins) if (!adminByTenant.has(a.tenantId)) adminByTenant.set(a.tenantId, a.userId);

    let dispatched = 0;
    for (const conn of connections) {
        const actorUserId = adminByTenant.get(conn.tenantId);
        if (!actorUserId) {
            logger.warn('sharepoint-delta-sync-dispatch: no eligible admin', {
                component: 'sharepoint',
                tenantId: conn.tenantId,
                connectionId: conn.id,
            });
            continue;
        }
        await enqueue('sharepoint-delta-sync', {
            tenantId: conn.tenantId,
            connectionId: conn.id,
            actorUserId,
            triggeredBy: 'scheduled',
        });
        dispatched++;
    }
    return { connections: connections.length, dispatched };
}

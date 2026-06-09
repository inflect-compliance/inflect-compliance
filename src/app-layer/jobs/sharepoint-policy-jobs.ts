/**
 * SP-4 — SharePoint policy-sync BullMQ jobs.
 *
 *   - `sharepoint-policy-pull`         — enqueued by the Graph webhook: create a
 *     new PolicyVersion from the changed SharePoint file.
 *   - `sharepoint-subscription-renew`  — daily cron: renew every active policy
 *     Graph subscription before it expires (cross-tenant fan-out).
 *
 * @module jobs/sharepoint-policy-jobs
 */
import prisma from '@/lib/prisma';
import type { RequestContext } from '@/app-layer/types';
import { getPermissionsForRole } from '@/lib/permissions';
import {
    pullPolicyFromSharePoint,
    getSharePointClientForTenant,
} from '@/app-layer/usecases/policy-sharepoint-sync';
import { logger } from '@/lib/observability/logger';
import type { SharePointPolicyPullPayload, SharePointSubscriptionRenewPayload } from './types';

/** Build a write-capable tenant context for a job actor (first active admin). */
async function buildPolicyJobContext(tenantId: string): Promise<RequestContext | null> {
    const admin = await prisma.tenantMembership.findFirst({
        where: { tenantId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true, role: true },
        orderBy: { createdAt: 'asc' },
    });
    if (!admin) return null;
    const appPermissions = getPermissionsForRole(admin.role);
    return {
        requestId: `sharepoint-policy-${tenantId}`,
        userId: admin.userId,
        tenantId,
        role: admin.role,
        permissions: {
            canRead: appPermissions.policies.view,
            canWrite: appPermissions.policies.edit,
            canAdmin: appPermissions.admin.manage,
            canAudit: appPermissions.audits.view,
            canExport: appPermissions.reports.export,
        },
        appPermissions,
    };
}

export async function runSharePointPolicyPull(payload: SharePointPolicyPullPayload) {
    const ctx = await buildPolicyJobContext(payload.tenantId);
    if (!ctx) return { pulled: false, reason: 'no_admin' };
    const policy = await prisma.policy.findFirst({
        where: { id: payload.policyId, tenantId: payload.tenantId },
        select: { spDriveId: true, spItemId: true },
    });
    if (!policy?.spDriveId || !policy.spItemId) return { pulled: false, reason: 'not_linked' };
    const r = await pullPolicyFromSharePoint(ctx, { driveId: policy.spDriveId, itemId: policy.spItemId });
    return { pulled: r.pulled };
}

const RENEW_TTL_MS = 2 * 24 * 60 * 60 * 1000;

export async function runSharePointSubscriptionRenew(_payload: SharePointSubscriptionRenewPayload) {
    const policies = await prisma.policy.findMany({
        where: { spSubscriptionId: { not: null } },
        select: { id: true, tenantId: true, spSubscriptionId: true },
        take: 5000,
    });
    let renewed = 0;
    // Cache one client per tenant (avoid rebuilding the token per policy).
    const clientByTenant = new Map<string, Awaited<ReturnType<typeof getSharePointClientForTenant>> | null>();
    for (const p of policies) {
        if (!p.spSubscriptionId) continue;
        let client = clientByTenant.get(p.tenantId);
        if (client === undefined) {
            const ctx = await buildPolicyJobContext(p.tenantId);
            client = ctx ? await getSharePointClientForTenant(ctx).catch(() => null) : null;
            clientByTenant.set(p.tenantId, client);
        }
        if (!client) continue;
        try {
            await client.renewSubscription(p.spSubscriptionId, new Date(Date.now() + RENEW_TTL_MS).toISOString());
            renewed++;
        } catch (err) {
            logger.warn('sharepoint-subscription-renew: renew failed', {
                component: 'sharepoint',
                tenantId: p.tenantId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return { subscriptions: policies.length, renewed };
}

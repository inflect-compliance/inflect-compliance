/**
 * RQ-2 — daily risk-appetite breach monitor (cross-tenant fan-out).
 *
 * For every tenant with a RiskAppetiteConfig: scan the portfolio,
 * persist new breaches, resolve stale ones. Notifications for new
 * breaches ride the existing pipeline (logged here; wired in follow-up).
 *
 * @module jobs/risk-appetite-jobs
 */
import prisma from '@/lib/prisma';
import type { RequestContext } from '@/app-layer/types';
import { getPermissionsForRole } from '@/lib/permissions';
import {
    checkPortfolioAppetite,
    recordBreaches,
    resolveStaleBreaches,
} from '@/app-layer/usecases/risk-appetite';
import { logger } from '@/lib/observability/logger';
import type { RiskAppetiteMonitorPayload } from './types';

/** Build a read-capable tenant context (first active admin/owner). */
async function buildCtx(tenantId: string): Promise<RequestContext | null> {
    const admin = await prisma.tenantMembership.findFirst({
        where: { tenantId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true, role: true },
        orderBy: { createdAt: 'asc' },
    });
    if (!admin) return null;
    const appPermissions = getPermissionsForRole(admin.role);
    return {
        requestId: `risk-appetite-${tenantId}`,
        userId: admin.userId,
        tenantId,
        role: admin.role,
        permissions: {
            canRead: appPermissions.risks.view,
            canWrite: appPermissions.risks.edit,
            canAdmin: appPermissions.admin.manage,
            canAudit: appPermissions.audits.view,
            canExport: appPermissions.reports.export,
        },
        appPermissions,
    };
}

export async function runRiskAppetiteMonitor(_payload: RiskAppetiteMonitorPayload) {
    const configs = await prisma.riskAppetiteConfig.findMany({ select: { tenantId: true }, take: 5000 });
    let scanned = 0;
    let newBreaches = 0;
    let resolved = 0;
    for (const { tenantId } of configs) {
        const ctx = await buildCtx(tenantId);
        if (!ctx) continue;
        try {
            const result = await checkPortfolioAppetite(ctx);
            newBreaches += await recordBreaches(ctx, result.breaches);
            resolved += await resolveStaleBreaches(ctx, result.breaches);
            scanned++;
        } catch (err) {
            logger.warn('risk-appetite-monitor: tenant scan failed', {
                component: 'risk-appetite',
                tenantId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return { tenants: configs.length, scanned, newBreaches, resolved };
}

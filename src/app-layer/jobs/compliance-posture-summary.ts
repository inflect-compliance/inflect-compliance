/**
 * Compliance-posture summary — daily cron.
 *
 * Two jobs (the SharePoint fan-out pattern):
 *   • `compliance-posture-summary-dispatch` — daily cross-tenant fan-out:
 *     enumerate active tenants and enqueue one per-tenant summary job each.
 *   • `compliance-posture-summary` — per-tenant: (re)generate + cache the
 *     tenant's posture summary. References `payload.tenantId`.
 *
 * The per-tenant job builds a tenant-scoped read context, calls
 * `generateCompliancePostureSummary`, and upserts the cached row. All reads +
 * the upsert run inside `runInTenantContext` (RLS-bound) one frame down.
 *
 * @module app-layer/jobs/compliance-posture-summary
 */
import prisma from '@/lib/prisma';
import { logger } from '@/lib/observability/logger';
import {
    buildPostureCronContext,
    generateCompliancePostureSummary,
} from '@/app-layer/usecases/compliance-posture';
import { enqueue } from './queue';
import type {
    CompliancePostureSummaryPayload,
    CompliancePostureDispatchPayload,
} from './types';

/**
 * Per-tenant runner. Builds the cron context for `payload.tenantId` and
 * regenerates the cached posture summary.
 */
export async function runCompliancePostureSummary(payload: CompliancePostureSummaryPayload) {
    const ctx = await buildPostureCronContext(payload.tenantId);
    if (!ctx) {
        logger.warn('compliance-posture-summary: tenant has no active members, skipping', {
            component: 'compliance-posture',
            tenantId: payload.tenantId,
        });
        return { tenantId: payload.tenantId, generated: false };
    }
    const result = await generateCompliancePostureSummary(ctx);
    return {
        tenantId: payload.tenantId,
        generated: true,
        provider: result.provider,
        postureLabel: result.postureLabel,
        isFallback: result.isFallback ?? false,
    };
}

/**
 * Cross-tenant fan-out. Enqueues one per-tenant summary job per active tenant.
 */
export async function runCompliancePostureDispatch(_payload: CompliancePostureDispatchPayload) {
    const tenants = await prisma.tenant.findMany({
        where: { deletedAt: null },
        select: { id: true },
        take: 5000,
    });

    let dispatched = 0;
    for (const { id } of tenants) {
        try {
            await enqueue('compliance-posture-summary', { tenantId: id });
            dispatched++;
        } catch (err) {
            logger.warn('compliance-posture-summary: enqueue failed for tenant', {
                component: 'compliance-posture',
                tenantId: id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return { tenants: tenants.length, dispatched };
}

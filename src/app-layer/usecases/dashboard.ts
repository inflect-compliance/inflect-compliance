/**
 * Dashboard Usecases
 *
 * Provides:
 *  - getDashboardData  — existing minimal stats (backward compat)
 *  - getExecutiveDashboard — full executive KPI payload (single call)
 *
 * @module app-layer/usecases/dashboard
 */
import { RequestContext } from '../types';
import {
    DashboardRepository,
    type ExecutiveDashboardPayload,
} from '../repositories/DashboardRepository';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { cachedDashboardRead } from '@/lib/cache/list-cache';

/**
 * Original dashboard data — used by the current dashboard page.
 * Backward-compatible; do not modify the return shape.
 */
export async function getDashboardData(ctx: RequestContext) {
    assertCanRead(ctx);

    return runInTenantContext(ctx, async (db) => {
        const [stats, recentActivity] = await Promise.all([
            DashboardRepository.getStats(db, ctx),
            DashboardRepository.getRecentActivity(db, ctx),
        ]);

        return {
            stats,
            recentActivity,
        };
    });
}

/**
 * Executive Dashboard — aggregated KPI payload.
 *
 * Returns all KPIs in a single structured response to minimize
 * round trips from the frontend. All sub-queries run in parallel
 * within a single transaction for consistency.
 *
 * Query budget:
 * - stats:            8 parallel count queries
 * - controlCoverage:  1 groupBy + 1 count
 * - riskBySeverity:   4 parallel counts
 * - riskByStatus:     1 groupBy
 * - evidenceExpiry:   5 parallel counts
 * - policySummary:    1 groupBy + 1 count
 * - taskSummary:      1 groupBy + 1 count
 * - vendorSummary:    2 counts
 * - exceptions:       5 parallel counts
 * - treatmentPlans:   5 parallel counts
 * Expected latency: <100ms on a warm connection pool
 */
export async function getExecutiveDashboard(ctx: RequestContext): Promise<ExecutiveDashboardPayload> {
    // Authorization is enforced on EVERY call, before any cache lookup — the
    // cache only ever holds data the requesting (tenant, user) is allowed to
    // read, and a denied caller never reaches the cached payload.
    assertCanRead(ctx);

    // PR3 perf: short-TTL cache (per tenant+user). Skips ~30 COUNT/GROUP BY
    // queries + ~6 RLS transactions on a hit. Bypassed entirely without Redis
    // (dev/test), so uncached behaviour is unchanged. Staleness ≤ TTL.
    return cachedDashboardRead({
        ctx,
        operation: 'executive',
        loader: () => runInTenantContext(ctx, async (db) => {
        const [
            stats,
            controlCoverage,
            riskBySeverity,
            riskByStatus,
            evidenceExpiry,
            policySummary,
            taskSummary,
            vendorSummary,
            riskHeatmap,
            upcomingExpirations,
            exceptions,
            treatmentPlans,
        ] = await Promise.all([
            DashboardRepository.getStats(db, ctx),
            DashboardRepository.getControlCoverage(db, ctx),
            DashboardRepository.getRiskBySeverity(db, ctx),
            DashboardRepository.getRiskByStatus(db, ctx),
            DashboardRepository.getEvidenceExpiry(db, ctx),
            DashboardRepository.getPolicySummary(db, ctx),
            DashboardRepository.getTaskSummary(db, ctx),
            DashboardRepository.getVendorSummary(db, ctx),
            DashboardRepository.getRiskHeatmap(db, ctx),
            DashboardRepository.getUpcomingExpirations(db, ctx),
            DashboardRepository.getExceptionSummary(db, ctx),
            DashboardRepository.getTreatmentPlanSummary(db, ctx),
        ]);

        return {
            stats,
            controlCoverage,
            riskBySeverity,
            riskByStatus,
            evidenceExpiry,
            policySummary,
            taskSummary,
            vendorSummary,
            riskHeatmap,
            upcomingExpirations,
            exceptions,
            treatmentPlans,
            computedAt: new Date().toISOString(),
        };
        }),
    });
}

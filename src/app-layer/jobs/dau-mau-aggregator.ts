/**
 * DAU / MAU aggregator — refreshes the active-user snapshot the
 * `business.tenant.active.{daily,monthly}` observable gauges report.
 *
 * Runs on a 5-minute cadence (cross-tenant). Computes the count of
 * DISTINCT active users per plan in two rolling windows, and pushes the
 * result into `business-metrics.ts` via `setActiveUserSnapshot`. The
 * gauges read that cached snapshot at scrape time, so the expensive
 * DISTINCT aggregation runs every 5 minutes regardless of scrape rate.
 *
 * "Active" = a user who made an audit-logged action (any mutation
 * writes an `AuditLog` row carrying the actor `userId`) in the window.
 * Both windows read the same source so the two numbers are directly
 * comparable:
 *
 *   • Daily  (DAU) — distinct AuditLog actors in the last 24h, by plan.
 *   • Monthly (MAU) — distinct AuditLog actors in the last 30d, by plan.
 *
 * "Distinct" is per-plan: a user active across two tenants on the SAME
 * plan counts once for that plan. See docs/observability/06-business-kpis.md.
 *
 * Cross-tenant: uses the default prisma client (no `app_user` role →
 * RLS bypassed via the superuser_bypass policy), the same pattern as
 * the other cross-tenant sweeps (`data-lifecycle.ts`).
 *
 * @module app-layer/jobs/dau-mau-aggregator
 */
import { prisma } from '@/lib/prisma';
import { getBillingMode, type Plan } from '@/lib/billing/entitlements';
import { setActiveUserSnapshot } from '@/lib/observability/business-metrics';
import { logger } from '@/lib/observability/logger';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

export interface DauMauResult {
    daily: Record<string, number>;
    monthly: Record<string, number>;
    dailyTotal: number;
    monthlyTotal: number;
}

/** Build a `tenantId → plan` map (self-hosted collapses to ENTERPRISE). */
async function buildPlanMap(): Promise<{ map: Map<string, Plan>; fallback: Plan }> {
    const selfHosted = getBillingMode() === 'SELFHOSTED';
    const fallback: Plan = selfHosted ? 'ENTERPRISE' : 'FREE';
    const map = new Map<string, Plan>();
    if (!selfHosted) {
        // guardrail-allow: unbounded — one row per billing tenant; the
        // table is small (one row per paying tenant) and there is no
        // useful page boundary for a full plan map.
        const accounts = await prisma.billingAccount.findMany({
            select: { tenantId: true, plan: true },
        });
        for (const a of accounts) map.set(a.tenantId, a.plan as Plan);
    }
    return { map, fallback };
}

/** Count distinct users per plan from (tenantId, userId) pairs. */
function countDistinctByPlan(
    pairs: Array<{ tenantId: string | null; userId: string | null }>,
    planMap: Map<string, Plan>,
    fallback: Plan,
): Record<string, number> {
    // plan → set of distinct userIds (dedupe a user across same-plan tenants).
    const usersByPlan = new Map<string, Set<string>>();
    for (const { tenantId, userId } of pairs) {
        if (!tenantId || !userId) continue;
        const plan = planMap.get(tenantId) ?? fallback;
        let set = usersByPlan.get(plan);
        if (!set) {
            set = new Set<string>();
            usersByPlan.set(plan, set);
        }
        set.add(userId);
    }
    const out: Record<string, number> = {};
    for (const [plan, set] of usersByPlan) out[plan] = set.size;
    return out;
}

/**
 * Aggregate DAU/MAU and push the snapshot to the gauges. `now` is
 * injectable for tests.
 */
export async function runDauMauAggregation(now: Date = new Date()): Promise<DauMauResult> {
    const { map: planMap, fallback } = await buildPlanMap();

    const daySince = new Date(now.getTime() - DAY_MS);
    const monthSince = new Date(now.getTime() - MONTH_MS);

    // DB-side DISTINCT — returns one row per (tenant,user) pair, not the
    // full audit volume. Both windows read AuditLog so DAU/MAU share one
    // "active = made an audit-logged action" definition.
    // guardrail-allow: unbounded — distinct (tenantId,userId) pairs in the
    // 24h window; DB-side DISTINCT bounds the result to active users.
    const dauPairs = await prisma.auditLog.findMany({
        where: { createdAt: { gte: daySince }, userId: { not: null } },
        select: { tenantId: true, userId: true },
        distinct: ['tenantId', 'userId'],
    });

    // guardrail-allow: unbounded — distinct (tenantId,userId) pairs over
    // the 30d window; DB-side DISTINCT bounds the result to active users.
    const mauPairs = await prisma.auditLog.findMany({
        where: { createdAt: { gte: monthSince }, userId: { not: null } },
        select: { tenantId: true, userId: true },
        distinct: ['tenantId', 'userId'],
    });

    const daily = countDistinctByPlan(dauPairs, planMap, fallback);
    const monthly = countDistinctByPlan(mauPairs, planMap, fallback);

    setActiveUserSnapshot({ daily, monthly, updatedAt: now.getTime() });

    const dailyTotal = Object.values(daily).reduce((s, n) => s + n, 0);
    const monthlyTotal = Object.values(monthly).reduce((s, n) => s + n, 0);

    logger.info('dau-mau aggregation complete', {
        component: 'dau-mau-aggregator',
        dailyTotal,
        monthlyTotal,
    });

    return { daily, monthly, dailyTotal, monthlyTotal };
}

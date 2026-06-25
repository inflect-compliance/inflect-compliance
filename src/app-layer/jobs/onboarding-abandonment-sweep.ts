/**
 * Onboarding-abandonment sweep — emits `business.onboarding.abandoned`
 * for tenants that started onboarding, went idle on a step for ≥7 days,
 * and never finished.
 *
 * Runs daily (cross-tenant). To fire EXACTLY ONCE per abandoned tenant
 * (rather than every day forever), it only counts rows whose last
 * activity falls in the [7d, 8d) window — with a daily cadence each
 * abandoned onboarding crosses that window on exactly one run. The
 * metric's `last_step_reached` label is the tenant's `currentStep`.
 *
 * Cross-tenant: default prisma client (RLS-bypassing), same pattern as
 * the other sweeps. See docs/observability/06-business-kpis.md.
 *
 * @module app-layer/jobs/onboarding-abandonment-sweep
 */
import { prisma } from '@/lib/prisma';
import { recordOnboardingAbandoned } from '@/lib/observability/business-metrics';
import { logger } from '@/lib/observability/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OnboardingAbandonmentResult {
    scanned: number;
    abandoned: number;
    byStep: Record<string, number>;
}

/**
 * Sweep for newly-abandoned onboardings. `now` is injectable for tests.
 */
export async function runOnboardingAbandonmentSweep(
    now: Date = new Date(),
): Promise<OnboardingAbandonmentResult> {
    // Fire once: last activity in [now-8d, now-7d).
    const windowEnd = new Date(now.getTime() - 7 * DAY_MS);
    const windowStart = new Date(now.getTime() - 8 * DAY_MS);

    // guardrail-allow: unbounded — at most one row per tenant that fell
    // idle in a single 24h window; naturally small, no page boundary.
    const stale = await prisma.tenantOnboarding.findMany({
        where: {
            completedAt: null,
            startedAt: { not: null },
            updatedAt: { gte: windowStart, lt: windowEnd },
        },
        select: { tenantId: true, currentStep: true },
    });

    const byStep: Record<string, number> = {};
    for (const row of stale) {
        const step = row.currentStep || 'UNKNOWN';
        recordOnboardingAbandoned({ lastStepReached: step });
        byStep[step] = (byStep[step] ?? 0) + 1;
    }

    logger.info('onboarding-abandonment sweep complete', {
        component: 'onboarding-abandonment-sweep',
        abandoned: stale.length,
    });

    return { scanned: stale.length, abandoned: stale.length, byStep };
}

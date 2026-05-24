/**
 * Evidence stale-review sweep — Audit Coherence S3 (2026-05-22).
 *
 * Auditors expect APPROVED evidence to carry a `nextReviewDate` and
 * for stale rows (past the date) to be re-reviewed. Pre-this-usecase
 * the date existed on the model and was surfaced in the compliance
 * calendar, but no automated transition fired — evidence silently
 * aged past its review date with `status = APPROVED`, and the audit
 * readiness score continued to count it as fresh.
 *
 * This sweep finds every APPROVED row whose `nextReviewDate` is in
 * the past and transitions it to `NEEDS_REVIEW` in one batch
 * `updateMany`. The author then re-submits via `reviewEvidence`
 * (SUBMITTED transition is permitted from NEEDS_REVIEW per the
 * state-machine table in evidence.ts), entering the normal review
 * queue again.
 *
 * Design choices:
 *   - One bulk `updateMany` per tenant, scoped to APPROVED +
 *     past-due `nextReviewDate` rows. No row-by-row read needed —
 *     the transition is deterministic given the where-clause.
 *   - NO audit log emitted per row by this sweep. The transition is
 *     automated + idempotent + bounded (only affects rows that
 *     match the predicate). Audit interest is in operator-driven
 *     transitions; the cron's mass-flip is an operational concern,
 *     not a per-row accountability concern. The job-runner level
 *     log records the count.
 *   - Tenant-scoped — accepts an optional `tenantId` to sweep a
 *     single tenant (the BullMQ cron sweeps all tenants by passing
 *     `undefined`).
 *   - `now` injectable for tests.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/observability/logger';
import { runJob } from '@/lib/observability/job-runner';

export interface StaleReviewSweepOptions {
    /** Override the "now" timestamp for tests. */
    now?: Date;
    /** Scope to a single tenant. Default: sweep all. */
    tenantId?: string;
}

export interface StaleReviewSweepResult {
    /** How many evidence rows transitioned APPROVED → NEEDS_REVIEW. */
    transitioned: number;
}

export async function runEvidenceStaleReviewSweep(
    options: StaleReviewSweepOptions = {},
): Promise<StaleReviewSweepResult> {
    return runJob('evidence-stale-review-sweep', async () => {
        const now = options.now ?? new Date();
        const result = await prisma.evidence.updateMany({
            where: {
                ...(options.tenantId ? { tenantId: options.tenantId } : {}),
                deletedAt: null,
                isArchived: false,
                status: 'APPROVED',
                nextReviewDate: { not: null, lt: now },
            },
            data: { status: 'NEEDS_REVIEW' },
        });
        logger.info('evidence stale-review sweep completed', {
            component: 'job',
            transitioned: result.count,
            tenantId: options.tenantId,
        });
        return { transitioned: result.count };
    }, { tenantId: options.tenantId });
}

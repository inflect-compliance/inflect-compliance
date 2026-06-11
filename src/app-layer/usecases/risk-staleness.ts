/**
 * RQ2-8 — staleness report (thin loader over `@/lib/risk-staleness`).
 *
 * One pass, four bounded queries, zero per-risk loops:
 *   1. live risks (id/title/nextReviewAt/residualScoreSetAt);
 *   2. newest score event per risk (groupBy _max);
 *   3. risk ↔ control links;
 *   4. newest COMPLETED test run per linked control (groupBy _max).
 * The pure detector compares timestamps in memory. Read-only;
 * recomputed per call.
 */
import { RequestContext } from '../types';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import {
    assessStaleness,
    describeStaleness,
    MAX_ASSESSMENT_AGE_DAYS,
    type StalenessReason,
} from '@/lib/risk-staleness';

export interface StaleRiskRow {
    riskId: string;
    title: string;
    reasons: StalenessReason[];
    assessmentAgeDays: number | null;
    /** Plain-language reason line for the widget. */
    description: string;
}

export interface StalenessReport {
    staleRisks: StaleRiskRow[];
    staleCount: number;
    totalCount: number;
    maxAssessmentAgeDays: number;
}

export async function getRiskStaleness(
    ctx: RequestContext,
): Promise<StalenessReport> {
    assertCanRead(ctx);

    return runInTenantContext(ctx, async (db) => {
        const risks = await db.risk.findMany({
            where: { tenantId: ctx.tenantId, deletedAt: null },
            select: {
                id: true,
                title: true,
                nextReviewAt: true,
                residualScoreSetAt: true,
            },
            // guardrail-allow: unbounded — staleness scans the whole
            // register; truncating would hide exactly the rows that
            // rot quietly at the bottom.
        });
        if (risks.length === 0) {
            return {
                staleRisks: [],
                staleCount: 0,
                totalCount: 0,
                maxAssessmentAgeDays: MAX_ASSESSMENT_AGE_DAYS,
            };
        }
        const riskIds = risks.map((r) => r.id);

        const [lastEvents, links] = await Promise.all([
            db.riskScoreEvent.groupBy({
                by: ['riskId'],
                where: { tenantId: ctx.tenantId, riskId: { in: riskIds } },
                _max: { createdAt: true },
            }),
            db.riskControl.findMany({
                where: { tenantId: ctx.tenantId, riskId: { in: riskIds } },
                select: { riskId: true, controlId: true },
                // guardrail-allow: unbounded — link rows for the same
                // bounded register scan above.
            }),
        ]);
        const lastAssessedByRisk = new Map(
            lastEvents.map((e) => [e.riskId, e._max.createdAt]),
        );

        const controlIds = [...new Set(links.map((l) => l.controlId))];
        const latestTestByControl = new Map<string, Date>();
        if (controlIds.length > 0) {
            const grouped = await db.controlTestRun.groupBy({
                by: ['controlId'],
                where: {
                    tenantId: ctx.tenantId,
                    controlId: { in: controlIds },
                    status: 'COMPLETED',
                },
                _max: { executedAt: true },
            });
            for (const g of grouped) {
                if (g._max.executedAt) latestTestByControl.set(g.controlId, g._max.executedAt);
            }
        }
        const latestTestByRisk = new Map<string, Date>();
        for (const l of links) {
            const t = latestTestByControl.get(l.controlId);
            if (!t) continue;
            const cur = latestTestByRisk.get(l.riskId);
            if (!cur || t > cur) latestTestByRisk.set(l.riskId, t);
        }

        const now = new Date();
        const staleRisks: StaleRiskRow[] = [];
        for (const r of risks) {
            const verdict = assessStaleness(
                {
                    nextReviewAt: r.nextReviewAt,
                    lastAssessedAt: lastAssessedByRisk.get(r.id) ?? null,
                    lastResidualAt: r.residualScoreSetAt,
                    latestControlTestAt: latestTestByRisk.get(r.id) ?? null,
                },
                now,
            );
            if (verdict.stale) {
                staleRisks.push({
                    riskId: r.id,
                    title: r.title,
                    reasons: verdict.reasons,
                    assessmentAgeDays: verdict.assessmentAgeDays,
                    description: describeStaleness(verdict) ?? '',
                });
            }
        }

        // Most reasons first, then oldest assessment first — the
        // rottenest rows top the widget.
        staleRisks.sort(
            (a, b) =>
                b.reasons.length - a.reasons.length ||
                (b.assessmentAgeDays ?? 0) - (a.assessmentAgeDays ?? 0),
        );

        return {
            staleRisks,
            staleCount: staleRisks.length,
            totalCount: risks.length,
            maxAssessmentAgeDays: MAX_ASSESSMENT_AGE_DAYS,
        };
    });
}

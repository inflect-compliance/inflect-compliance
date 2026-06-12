/**
 * RQ2-3 — "why this number": one aggregated payload that lets any
 * score chip explain itself without the user navigating anywhere.
 *
 * Single round-trip (page-data orchestrator pattern) gathering:
 *   - the score trio (inherent dims/score, residual dims/score) with
 *     the formula rendered in the TENANT'S OWN language (matrix
 *     config level labels + band from the canonical resolver);
 *   - the last few provenance events (RQ2-1) with actor names —
 *     who/when/source, including the MIGRATION flag for divisor-era
 *     residuals;
 *   - the control-derivation summary (RQ2-2) — what the linked
 *     controls justify right now;
 *   - the quantitative line when the risk is FAIR'd/SLE'd
 *     (`resolveALE`), in plain language;
 *   - open appetite breaches attributed to this risk (RQ-2).
 *
 * Read-only; every section degrades to null independently so a
 * partially-configured tenant still gets a useful popover.
 */
import { RequestContext } from '../types';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { notFound } from '@/lib/errors/types';
import { resolveALE } from './fair-calculator';
import { loadResidualSuggestion } from './risk-residual-suggestion';
import { describeCombination } from '@/lib/risk-residual';
import { getRiskMatrixConfig } from './risk-matrix-config';
import { resolveBandForScore } from '@/lib/risk-matrix/scoring';
import { formatCompactCurrency } from '@/lib/risk-coherence';
import { formatTailAwareAle } from '@/lib/tail-language';
import { getPerRiskPercentiles } from './monte-carlo';

export interface ScoreExplanationEvent {
    kind: 'INHERENT' | 'RESIDUAL';
    likelihood: number;
    impact: number;
    score: number;
    source: 'USER' | 'DERIVED' | 'PLAN' | 'AI' | 'MIGRATION';
    justification: string | null;
    actorName: string | null;
    createdAt: Date;
}

export interface ScoreExplanation {
    riskId: string;
    inherent: {
        likelihood: number;
        impact: number;
        score: number;
        likelihoodLabel: string | null;
        impactLabel: string | null;
        bandName: string | null;
        bandColor: string | null;
    };
    residual: {
        likelihood: number | null;
        impact: number | null;
        score: number | null;
        bandName: string | null;
        bandColor: string | null;
        /** True when the stored residual predates decomposition. */
        legacyUndecomposed: boolean;
    } | null;
    /** RQ2-2 — what the linked controls justify right now. */
    controls: {
        summary: string;
        participatingCount: number;
        suggestedScore: number | null;
    };
    /** Plain-language quant line; null when not quantified. */
    quant: { ale: number; line: string } | null;
    /** Open (unresolved) appetite breaches attributed to this risk. */
    openBreaches: Array<{ breachType: string; thresholdValue: number; actualValue: number; detectedAt: Date }>;
    recentEvents: ScoreExplanationEvent[];
}

function levelLabel(
    labels: unknown,
    axis: 'likelihood' | 'impact',
    level: number,
): string | null {
    if (!labels || typeof labels !== 'object') return null;
    const arr = (labels as Record<string, unknown>)[axis];
    if (!Array.isArray(arr)) return null;
    const v = arr[level - 1];
    return typeof v === 'string' ? v : null;
}

export async function getScoreExplanation(
    ctx: RequestContext,
    riskId: string,
): Promise<ScoreExplanation> {
    assertCanRead(ctx);

    // Tenant matrix config — outside the main transaction (it has its
    // own read path + defaults for unconfigured tenants).
    const matrix = await getRiskMatrixConfig(ctx);
    // RQ3-4 — the per-risk tail cache (RQ3-1); null when no run.
    const tailSnapshot = await getPerRiskPercentiles(ctx);

    return runInTenantContext(ctx, async (db) => {
        const risk = await db.risk.findFirst({
            where: { id: riskId, tenantId: ctx.tenantId },
            select: {
                likelihood: true,
                impact: true,
                score: true,
                inherentScore: true,
                residualLikelihood: true,
                residualImpact: true,
                residualScore: true,
                sleAmount: true,
                aroAmount: true,
                fairAle: true,
            },
        });
        if (!risk) throw notFound('Risk not found');

        // RQ3-OB-A — the quant line speaks the tenant's currency.
        const tenantRow = await db.tenant.findUnique({
            where: { id: ctx.tenantId },
            select: { currencySymbol: true },
        });
        const sym = tenantRow?.currencySymbol ?? '€';

        const [events, breaches, residualSuggestion] = await Promise.all([
            db.riskScoreEvent.findMany({
                where: { tenantId: ctx.tenantId, riskId },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }),
            db.riskAppetiteBreach.findMany({
                where: { tenantId: ctx.tenantId, riskId, resolvedAt: null },
                select: { breachType: true, thresholdValue: true, actualValue: true, detectedAt: true },
                orderBy: { detectedAt: 'desc' },
                take: 10,
            }),
            loadResidualSuggestion(db, ctx.tenantId, riskId),
        ]);

        // Actor names — one batched lookup (RQ2-1 pattern).
        const actorIds = [...new Set(events.map((e) => e.createdByUserId).filter((v): v is string => Boolean(v)))];
        const actors = actorIds.length
            ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
            : [];
        const actorById = new Map(actors.map((a) => [a.id, a.name]));

        const inherentBand = resolveBandForScore(risk.inherentScore, matrix.bands);
        const residualBand =
            risk.residualScore !== null ? resolveBandForScore(risk.residualScore, matrix.bands) : null;

        const ale = resolveALE(risk);

        return {
            riskId,
            inherent: {
                likelihood: risk.likelihood,
                impact: risk.impact,
                score: risk.inherentScore,
                likelihoodLabel: levelLabel(matrix.levelLabels, 'likelihood', risk.likelihood),
                impactLabel: levelLabel(matrix.levelLabels, 'impact', risk.impact),
                bandName: inherentBand?.name ?? null,
                bandColor: inherentBand?.color ?? null,
            },
            residual:
                risk.residualScore !== null
                    ? {
                          likelihood: risk.residualLikelihood,
                          impact: risk.residualImpact,
                          score: risk.residualScore,
                          bandName: residualBand?.name ?? null,
                          bandColor: residualBand?.color ?? null,
                          legacyUndecomposed: risk.residualLikelihood === null,
                      }
                    : null,
            controls: {
                summary: describeCombination(residualSuggestion.combined),
                participatingCount: residualSuggestion.combined.participatingCount,
                suggestedScore: residualSuggestion.suggestion?.residualScore ?? null,
            },
            quant:
                ale !== null
                    ? {
                          ale,
                          // RQ3-4 — the quant line speaks both
                          // registers through the one tail formatter.
                          line:
                              formatTailAwareAle(ale, tailSnapshot?.byRisk[riskId]?.aleP90 ?? null, {
                                  money: (v) => formatCompactCurrency(v, sym),
                              }) ?? `${formatCompactCurrency(ale, sym)}/yr`,
                      }
                    : null,
            openBreaches: breaches,
            recentEvents: events.map((e) => ({
                kind: e.kind,
                likelihood: e.likelihood,
                impact: e.impact,
                score: e.score,
                source: e.source,
                justification: e.justification,
                actorName: e.createdByUserId ? (actorById.get(e.createdByUserId) ?? null) : null,
                createdAt: e.createdAt,
            })),
        };
    });
}

// Compact currency moved to its canonical pure home in RQ2-5;
// re-exported so existing imports (and the unit suite) stay stable.
export { formatCompactCurrency } from '@/lib/risk-coherence';

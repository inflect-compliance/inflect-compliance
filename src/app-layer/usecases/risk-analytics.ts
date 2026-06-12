/**
 * B10 — Quantitative risk analytics.
 *
 * Reads the live risk portfolio and emits the aggregate
 * statistics a risk-quant audience expects:
 *
 *   • Totals — count of risks, count of "quantified" risks (those
 *     with both SLE and ARO populated), total ALE (Σ SLE×ARO),
 *     average ALE among the quantified subset.
 *
 *   • Top-10 by ALE — the highest-exposure risks, useful as a
 *     "where to focus" list.
 *
 *   • Distribution by category — same metrics partitioned by
 *     `Risk.category`. Drives the analytics-tab "where does the
 *     exposure concentrate" chart.
 *
 *   • Coverage sketch (RQ3-1 demotion — formerly "lecPoints") — a
 *     sorted-loss-by-rank emission: each quantified risk
 *     contributes one (ALE, fraction) point. This is NOT a
 *     simulated loss distribution — it answers "what share of
 *     RISKS sit above this loss" (a coverage question), never
 *     "what is the probability the YEAR'S losses exceed X" (the
 *     LEC question). The simulation harness now exists
 *     (usecases/monte-carlo.ts) and its curve is the only loss
 *     exceedance curve the dashboard may headline; the
 *     `rq3-1-simulated-lec` ratchet bans this sketch from being
 *     rendered as an LEC again.
 *
 * The "quantitative" subset is computed inside the function — a
 * risk with NULL `sleAmount` or `aroAmount` contributes to count
 * but NOT to totalAle / avgAle / topByAle / coverageSketch. The
 * analytics view of qualitative-only portfolios is documented in
 * the UI ("No quantified risks yet — set SLE + ARO on a risk to
 * activate the analytics").
 */
import { RequestContext } from '../types';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { resolveALE } from './fair-calculator';
import { detectIncoherence, type CoherenceReport } from '@/lib/risk-coherence';

export interface QuantitativeRiskTotals {
    /** Every active risk in the tenant. */
    totalCount: number;
    /** Risks with both `sleAmount` AND `aroAmount` populated. */
    quantifiedCount: number;
    /** Σ (sleAmount × aroAmount) across the quantified subset. */
    totalAle: number;
    /** Σ ALE / quantifiedCount — null when quantifiedCount = 0. */
    avgAle: number | null;
    /** The single largest ALE value in the portfolio. */
    maxAle: number | null;
}

export interface QuantitativeRiskRow {
    id: string;
    title: string;
    category: string | null;
    sleAmount: number;
    aroAmount: number;
    ale: number;
}

export interface CategoryDistribution {
    category: string;
    count: number;
    totalAle: number;
}

/**
 * RQ3-1 — one point per quantified risk: (its ALE, the share of
 * risks at or above it). A COVERAGE statement about the register,
 * not a probability statement about annual loss — see the module
 * docstring. Render as a ranked list or coverage table, never as a
 * loss exceedance curve.
 */
export interface CoverageSketchPoint {
    /** Loss threshold (currency). */
    threshold: number;
    /** Number of risks whose ALE ≥ threshold. */
    exceedanceCount: number;
    /** exceedanceCount / quantifiedCount (0..1). */
    exceedanceFraction: number;
}

export interface RiskQuantitativeAnalytics {
    totals: QuantitativeRiskTotals;
    topByAle: QuantitativeRiskRow[];
    byCategory: CategoryDistribution[];
    /** RQ3-1 — demoted from `lecPoints`; see CoverageSketchPoint. */
    coverageSketch: CoverageSketchPoint[];
}

const TOP_N = 10;

export async function getRiskQuantitativeAnalytics(
    ctx: RequestContext,
): Promise<RiskQuantitativeAnalytics> {
    assertCanRead(ctx);

    return runInTenantContext(ctx, async (db) => {
        const risks = await db.risk.findMany({
            where: {
                tenantId: ctx.tenantId,
                deletedAt: null,
            },
            select: {
                id: true,
                title: true,
                category: true,
                sleAmount: true,
                aroAmount: true,
                // RQ-1 — FAIR ALE takes precedence over legacy SLE×ARO.
                fairAle: true,
            },
            // guardrail-allow: unbounded — analytics aggregate over
            // the whole portfolio. A `take:` would silently truncate
            // the totals.
        });

        // Materialise the quantified subset. RQ-1: a risk is "quantified"
        // if `resolveALE` yields a value — FAIR ALE when present, else
        // legacy SLE×ARO. FAIR-only risks expose null SLE/ARO (shown as 0).
        const quantified: QuantitativeRiskRow[] = [];
        for (const r of risks) {
            const ale = resolveALE({ fairAle: r.fairAle, sleAmount: r.sleAmount, aroAmount: r.aroAmount });
            if (ale != null && isFinite(ale)) {
                quantified.push({
                    id: r.id,
                    title: r.title,
                    category: r.category,
                    sleAmount: r.sleAmount ?? 0,
                    aroAmount: r.aroAmount ?? 0,
                    ale,
                });
            }
        }

        const totalAle = quantified.reduce((s, r) => s + r.ale, 0);
        const maxAle =
            quantified.length > 0
                ? quantified.reduce((m, r) => (r.ale > m ? r.ale : m), 0)
                : null;
        const totals: QuantitativeRiskTotals = {
            totalCount: risks.length,
            quantifiedCount: quantified.length,
            totalAle,
            avgAle:
                quantified.length > 0 ? totalAle / quantified.length : null,
            maxAle,
        };

        // Top-N by ALE descending.
        const topByAle = [...quantified]
            .sort((a, b) => b.ale - a.ale)
            .slice(0, TOP_N);

        // Distribution by category. "(uncategorised)" bucket for
        // risks with null category so they don't silently vanish.
        const categoryMap = new Map<string, CategoryDistribution>();
        for (const r of quantified) {
            const key = r.category || '(uncategorised)';
            const existing = categoryMap.get(key);
            if (existing) {
                existing.count += 1;
                existing.totalAle += r.ale;
            } else {
                categoryMap.set(key, {
                    category: key,
                    count: 1,
                    totalAle: r.ale,
                });
            }
        }
        const byCategory = Array.from(categoryMap.values()).sort(
            (a, b) => b.totalAle - a.totalAle,
        );

        // Coverage sketch. Sorted-loss-by-rank emission — each
        // quantified risk contributes one (ALE, fraction) point.
        // NOT an LEC; see the module docstring.
        const sortedAles = quantified.map((r) => r.ale).sort((a, b) => b - a);
        const coverageSketch: CoverageSketchPoint[] = [];
        if (sortedAles.length > 0) {
            for (let i = 0; i < sortedAles.length; i++) {
                coverageSketch.push({
                    threshold: sortedAles[i],
                    exceedanceCount: i + 1,
                    exceedanceFraction: (i + 1) / sortedAles.length,
                });
            }
        }

        return { totals, topByAle, byCategory, coverageSketch };
    });
}

/**
 * RQ2-5 — qual ↔ quant coherence report.
 *
 * Thin loader over the pure `detectIncoherence`: one narrow scan of
 * the live portfolio (id/title/score + the three ALE inputs), rank
 * disagreement computed in memory. Read-only; recomputed per call so
 * the report always reflects the current scores + quant inputs.
 */
export async function getRiskCoherence(
    ctx: RequestContext,
): Promise<CoherenceReport> {
    assertCanRead(ctx);

    return runInTenantContext(ctx, async (db) => {
        const risks = await db.risk.findMany({
            where: { tenantId: ctx.tenantId, deletedAt: null },
            select: {
                id: true,
                title: true,
                inherentScore: true,
                sleAmount: true,
                aroAmount: true,
                fairAle: true,
            },
            // guardrail-allow: unbounded — coherence ranks the whole
            // portfolio; truncating would corrupt the percentiles.
        });

        return detectIncoherence(
            risks.map((r) => ({
                id: r.id,
                title: r.title,
                score: r.inherentScore,
                ale: resolveALE({
                    fairAle: r.fairAle,
                    sleAmount: r.sleAmount,
                    aroAmount: r.aroAmount,
                }),
            })),
        );
    });
}

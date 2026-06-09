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
 *   • Loss exceedance curve — a sorted-loss-by-rank emission used
 *     by the `<LossExceedanceCurve>` chart primitive to render
 *     P(loss ≥ X). The simplest interpretation: each quantified
 *     risk contributes one (ALE, fraction) point to the curve.
 *     This is NOT a Monte-Carlo convolution — that would need a
 *     simulation harness; the rank-based curve is the canonical
 *     bootstrap a risk-management dashboard surfaces first.
 *
 * The "quantitative" subset is computed inside the function — a
 * risk with NULL `sleAmount` or `aroAmount` contributes to count
 * but NOT to totalAle / avgAle / topByAle / lecPoints. The
 * analytics view of qualitative-only portfolios is documented in
 * the UI ("No quantified risks yet — set SLE + ARO on a risk to
 * activate the analytics").
 */
import { RequestContext } from '../types';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { resolveALE } from './fair-calculator';

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

export interface LossExceedancePoint {
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
    lecPoints: LossExceedancePoint[];
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

        // Loss exceedance curve. Sorted-loss-by-rank emission —
        // each quantified risk contributes one (ALE, fraction)
        // point. The chart renders these as a step curve.
        const sortedAles = quantified.map((r) => r.ale).sort((a, b) => b - a);
        const lecPoints: LossExceedancePoint[] = [];
        if (sortedAles.length > 0) {
            for (let i = 0; i < sortedAles.length; i++) {
                lecPoints.push({
                    threshold: sortedAles[i],
                    exceedanceCount: i + 1,
                    exceedanceFraction: (i + 1) / sortedAles.length,
                });
            }
        }

        return { totals, topByAle, byCategory, lecPoints };
    });
}

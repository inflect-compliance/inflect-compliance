/**
 * RQ2-5 — qual ↔ quant coherence (pure math).
 *
 * The product speaks two risk languages: qualitative (L×I score,
 * matrix bands) and quantitative (FAIR / SLE×ARO ALE). Nothing
 * connected them — a risk could sit at qual score 4/25 with a €2M
 * ALE and the product never noticed the contradiction.
 *
 * `detectIncoherence` flags RANK disagreement inside the quantified
 * subset: a risk whose ALE percentile is in the top quartile while
 * its qual-score percentile is in the bottom quartile (or vice
 * versa). Ranks, not absolute thresholds — €50K may be a top risk
 * for a bakery and noise for a bank, but rank disagreement is
 * meaningful at any scale.
 *
 * Honesty constraints:
 *   - Only quantified risks (ale !== null) participate. Comparing a
 *     quantified risk's ALE rank against unquantified risks' scores
 *     would manufacture contradictions out of missing data.
 *   - Below MIN_QUANTIFIED_FOR_COHERENCE the quartile split is
 *     statistically meaningless — the detector returns [] (zero
 *     cost, zero noise for barely-quantified tenants).
 *
 * This module is pure — no DB, no ctx — mirroring
 * `@/lib/risk-residual`. The usecase layer stays a thin loader.
 */

/** Quartiles need at least 4 members to mean anything. */
export const MIN_QUANTIFIED_FOR_COHERENCE = 4;

/** Top / bottom quartile boundaries (percentile ranks, 0..1). */
export const HIGH_QUARTILE = 0.75;
export const LOW_QUARTILE = 0.25;

export interface CoherenceInput {
    id: string;
    title: string;
    /** Qualitative score (L×I rollup). */
    score: number;
    /** Resolved ALE (fairAle, else SLE×ARO) — null = not quantified. */
    ale: number | null;
}

export type IncoherenceDirection =
    /** Money says top risk; the matrix says minor. */
    | 'QUANT_HIGH_QUAL_LOW'
    /** The matrix says top risk; money says minor. */
    | 'QUAL_HIGH_QUANT_LOW';

export interface CoherenceFlag {
    riskId: string;
    title: string;
    direction: IncoherenceDirection;
    score: number;
    ale: number;
    /** Percentile rank (0..1) within the quantified subset. */
    scorePercentile: number;
    alePercentile: number;
}

export interface CoherenceReport {
    flags: CoherenceFlag[];
    /** Risks with a resolvable ALE. */
    quantifiedCount: number;
    totalCount: number;
    /** Below this quantified count the detector stays silent. */
    minRequired: number;
}

/**
 * Mid-rank percentile (average rank of ties, scaled to 0..1).
 * Ties share a percentile so a portfolio of identical scores can
 * never self-flag.
 */
function percentileRanks(values: number[]): number[] {
    const n = values.length;
    if (n <= 1) return values.map(() => 0.5);
    return values.map((v) => {
        let below = 0;
        let equal = 0;
        for (const other of values) {
            if (other < v) below += 1;
            else if (other === v) equal += 1;
        }
        // Mid-rank: count self in `equal`, average the tied block.
        return (below + (equal - 1) / 2) / (n - 1);
    });
}

export function detectIncoherence(risks: CoherenceInput[]): CoherenceReport {
    const quantified = risks.filter(
        (r): r is CoherenceInput & { ale: number } => r.ale !== null,
    );
    const report: CoherenceReport = {
        flags: [],
        quantifiedCount: quantified.length,
        totalCount: risks.length,
        minRequired: MIN_QUANTIFIED_FOR_COHERENCE,
    };
    if (quantified.length < MIN_QUANTIFIED_FOR_COHERENCE) return report;

    const scoreRanks = percentileRanks(quantified.map((r) => r.score));
    const aleRanks = percentileRanks(quantified.map((r) => r.ale));

    quantified.forEach((r, i) => {
        const scoreP = scoreRanks[i];
        const aleP = aleRanks[i];
        let direction: IncoherenceDirection | null = null;
        if (aleP >= HIGH_QUARTILE && scoreP <= LOW_QUARTILE) {
            direction = 'QUANT_HIGH_QUAL_LOW';
        } else if (scoreP >= HIGH_QUARTILE && aleP <= LOW_QUARTILE) {
            direction = 'QUAL_HIGH_QUANT_LOW';
        }
        if (direction) {
            report.flags.push({
                riskId: r.id,
                title: r.title,
                direction,
                score: r.score,
                ale: r.ale,
                scorePercentile: scoreP,
                alePercentile: aleP,
            });
        }
    });

    // Worst disagreement first (largest percentile gap).
    report.flags.sort(
        (a, b) =>
            Math.abs(b.alePercentile - b.scorePercentile) -
            Math.abs(a.alePercentile - a.scorePercentile),
    );
    return report;
}

/**
 * Compact currency for chips and matrix cells (€1.2M, €430K, €900).
 * Canonical home — the RQ2-3 explainer re-exports this.
 */
export function formatCompactCurrency(v: number): string {
    if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}K`;
    return `€${Math.round(v)}`;
}

/**
 * RQ3-4 — tail-aware ALE language (pure).
 *
 * Nobody buys insurance because of the mean; they buy it because of
 * the bad year. This module is the ONE formatter every per-risk ALE
 * surface renders through (list chip, detail meta strip, score
 * explainer, coherence rows, top-10, PDF/PPTX rows) so the second
 * register — "expected €120K · bad year €1.4M (P90)" — can never
 * silently drop back to a bare mean where tail data exists.
 *
 * Sources: the per-risk percentile cache from RQ3-1
 * (`getPerRiskPercentiles` / `perRiskResultsJson.aleP90`).
 *
 * Honesty rules:
 *   - a P90 at or below the mean is NOT tail data (pre-RQ3-1 runs
 *     degrade percentiles to the mean) — the mean register renders;
 *   - the mean register on FULL surfaces carries the
 *     "(mean — run a simulation for tails)" suffix so the absence
 *     of tails reads as a gap, not a fact;
 *   - compact surfaces (chips) omit the suffix — a chip cannot
 *     carry the lecture, the full surfaces do.
 *
 * Pure module — no DB, no ctx. Callers supply the money formatter
 * (the OB-A `useMoneyFormatter()` hook client-side; a
 * `formatCompactCurrency(v, symbol)` binding server-side) so the
 * tenant-currency single voice holds.
 */

export interface TailRegisterOptions {
    /** The tenant-currency money formatter (one voice — OB-A). */
    money: (v: number | null | undefined) => string;
    /** Chips: short register, no mean-suffix lecture. */
    compact?: boolean;
}

/**
 * Format a per-risk ALE with its tail, through one voice.
 * Returns null when the mean itself is absent (nothing to say).
 */
export function formatTailAwareAle(
    aleMean: number | null | undefined,
    aleP90: number | null | undefined,
    opts: TailRegisterOptions,
): string | null {
    if (aleMean == null || Number.isNaN(aleMean)) return null;
    const { money, compact = false } = opts;
    const hasTail = aleP90 != null && !Number.isNaN(aleP90) && aleP90 > aleMean;
    if (hasTail) {
        return compact
            ? `${money(aleMean)} · bad yr ${money(aleP90)}`
            : `expected ${money(aleMean)} · bad year ${money(aleP90)} (P90)`;
    }
    return compact ? money(aleMean) : `${money(aleMean)}/yr (mean — run a simulation for tails)`;
}

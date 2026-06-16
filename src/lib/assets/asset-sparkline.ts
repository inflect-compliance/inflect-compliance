/**
 * Asset KPI sparkline helpers.
 *
 * The `ComplianceSnapshot` asset-KPI columns (`assetsTotal`, `assetsActive`,
 * `assetsHighCriticality`, `assetsRetired`) were added on 2026-06-07 with
 * `@default(0)`. Every snapshot created BEFORE that date reads `0` for every
 * asset metric — a FALSE history, not a real "ramp from zero". So a 30-day
 * trend for a tenant with, say, one retired asset renders as
 * `[0,0,…,0,1,1,1]` (a fake ramp) instead of the truthful flat `1`.
 *
 * `firstAssetDataIndex` finds the first day with real asset data, gated on
 * `total > 0` (the superset — if total is 0 there is no asset data to plot,
 * whether the row is a pre-column default OR a genuinely empty day). Slicing
 * all four series from this index keeps them date-aligned and truthful.
 */
export function firstAssetDataIndex(total: ReadonlyArray<{ value: number }>): number {
    const i = total.findIndex((p) => p.value > 0);
    return i < 0 ? total.length : i;
}

/**
 * Centered y-domain for a KPI sparkline so a ROW of sparklines all sit at the
 * SAME vertical level regardless of magnitude.
 *
 * The earlier shared `[0, globalMax]` domain pinned low-value metrics
 * (criticality 0, retired 1) to the bottom and high ones (total 14) to the top
 * — visually "some lower, some higher". Centering each series in the middle
 * ~50% band instead makes the row read as uniform: the data's midpoint lands at
 * the vertical centre for every card.
 *
 * Returns `undefined` for a constant or empty series — the chart's own auto-fit
 * already centres those (`[v-1, v+1]`).
 */
export function centeredSparklineDomain(
    series: ReadonlyArray<{ value: number }> | undefined,
): [number, number] | undefined {
    if (!series || series.length === 0) return undefined;
    let min = series[0].value;
    let max = series[0].value;
    for (const { value } of series) {
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (min === max) return undefined; // constant → chart auto-fit centres it
    const pad = (max - min) * 0.5; // data occupies the middle ~50% band
    return [min - pad, max + pad];
}

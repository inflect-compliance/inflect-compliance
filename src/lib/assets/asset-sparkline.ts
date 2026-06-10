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

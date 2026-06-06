import type { TimeSeriesPoint } from '@/components/ui/charts';

/**
 * Cumulative-by-`createdAt` sparkline series for an asset KPI tile.
 *
 * At each of `points` evenly-spaced moments between the first and last
 * matching asset's creation, the running count of matching assets. The
 * final point equals the tile's current number, so the line shows how
 * that number accrued. Derived client-side from the already-loaded rows
 * — no extra request, and no historical snapshot table (an approximation
 * that uses each asset's CURRENT attributes against its creation date).
 *
 * Returns `[]` for zero matches (the card then draws nothing); a single
 * matching date yields a flat 2-point line so the sparkline still renders.
 */
/** Minimal asset shape the KPI sparklines read off the loaded rows. */
export interface AssetTrendRow {
    createdAt?: string | Date | null;
    status?: string | null;
    criticality?: string | null;
}

export function buildCumulativeTrend(
    rows: ReadonlyArray<AssetTrendRow>,
    predicate: (r: AssetTrendRow) => boolean,
    points = 10,
): TimeSeriesPoint[] {
    const times = rows
        .filter(predicate)
        .map((r) => new Date(r?.createdAt ?? 0).getTime())
        .filter((t) => Number.isFinite(t) && t > 0)
        .sort((a, b) => a - b);
    if (times.length === 0) return [];
    const start = times[0];
    const end = times[times.length - 1];
    if (end <= start) {
        return [
            { date: new Date(start), value: times.length },
            { date: new Date(start + 1), value: times.length },
        ];
    }
    const step = (end - start) / (points - 1);
    const out: TimeSeriesPoint[] = [];
    let idx = 0;
    for (let i = 0; i < points; i++) {
        const t = i === points - 1 ? end : start + step * i;
        while (idx < times.length && times[idx] <= t) idx++;
        out.push({ date: new Date(t), value: idx });
    }
    return out;
}

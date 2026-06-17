'use client';

/**
 * Canonical KPI-card sparkline data layer.
 *
 * Every entity list page (Assets, Controls, Risks, Evidence, Policies,
 * Vendors, …) renders a row of `<KpiFilterCard>`s, and each card can show an
 * inline sparkline of that metric's REAL per-day history. The series come
 * from the daily `ComplianceSnapshot` job (one frozen point per 24h) via
 * `GET /dashboard/trends` — the same source the executive dashboard uses, NOT
 * a client-side replay of the loaded rows.
 *
 * This module is the ONE place that fetches + shapes that data, so the six
 * KPI pages share a single cached request and an identical, truthful sparkline
 * pipeline instead of each hand-rolling it.
 *
 *   const trends = useKpiTrends(tenantSlug);
 *   const spark = buildKpiSparklines(trends.data?.dataPoints, (d) => d.controlsTotal, {
 *       total: (d) => d.controlsTotal,
 *       implemented: (d) => d.controlsImplemented,
 *   });
 *   // <KpiFilterCard sparkline={spark.total}
 *   //                sparklineDomain={centeredSparklineDomain(spark.total)} />
 */

import { useQuery } from '@tanstack/react-query';
import type {
    TrendDataPoint,
    TrendPayload,
} from '@/app-layer/usecases/compliance-trends';
import type { TimeSeriesPoint } from '@/components/ui/charts';

/** Shared 30-day trends fetch — one cache entry across every KPI page. */
export function useKpiTrends(tenantSlug: string) {
    return useQuery<TrendPayload>({
        // Tenant-scoped + shared key so all entity pages reuse one fetch.
        queryKey: ['kpi-trends', tenantSlug, 30],
        queryFn: async (): Promise<TrendPayload> => {
            const res = await fetch(`/api/t/${tenantSlug}/dashboard/trends?days=30`);
            if (!res.ok) throw new Error('Failed to fetch KPI trends');
            return res.json();
        },
        staleTime: 5 * 60_000,
    });
}

/**
 * Shape a set of date-aligned per-card series from the trend points, trimming
 * the leading defaulted-zero prefix.
 *
 * Snapshot metric columns are `@default(0)` and were added on different dates,
 * so snapshots from before a column existed read `0` — a FALSE history that
 * renders as a fake "ramp from zero". `anchor` (the entity's total) defines
 * where real data begins: every series is sliced at the SAME index (first day
 * the total is > 0) so they stay date-aligned and start where data is real.
 * A fresh tenant (or < 2 real points) yields short series; `<KpiFilterCard>`
 * draws no sparkline below 2 points.
 */
export function buildKpiSparklines<K extends string>(
    points: readonly TrendDataPoint[] | undefined,
    anchor: (d: TrendDataPoint) => number,
    pickers: Record<K, (d: TrendDataPoint) => number>,
): Record<K, TimeSeriesPoint[]> {
    const pts = points ?? [];
    const firstReal = pts.findIndex((d) => anchor(d) > 0);
    const trimmed = firstReal < 0 ? [] : pts.slice(firstReal);
    const out = {} as Record<K, TimeSeriesPoint[]>;
    for (const key in pickers) {
        out[key] = trimmed.map((d) => ({
            date: new Date(d.date),
            value: pickers[key](d),
        }));
    }
    return out;
}

/**
 * Centered y-domain for a KPI sparkline so a ROW of sparklines sit at the SAME
 * vertical level regardless of magnitude — the data's midpoint lands at the
 * vertical centre of every card. Returns `undefined` for a constant/empty
 * series (the chart's own auto-fit already centres those).
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

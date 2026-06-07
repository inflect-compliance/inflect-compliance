# 2026-06-07 — Asset KPI sparklines move to daily snapshots

**Commit:** `<sha>` fix(assets): KPI sparklines track real per-day history via ComplianceSnapshot

## Problem

The Assets-page KPI cards (Total / Active / High criticality / Retired)
drew a sparkline from `buildCumulativeTrend` — a **client-side replay**
of the currently-loaded rows: take each loaded asset's `createdAt`,
draw a cumulative count as if you replayed creation order. Three
defects fell out of that design:

- **Adding assets didn't visibly move the line.** `MiniAreaChart` scales
  its y-axis to the data's own `[minY, maxY]` (`mini-area-chart.tsx`),
  and a cumulative series' last point is always its max — so the
  endpoint is always pinned to the top of the plot regardless of the
  absolute total. 10 → 14 looks identical to staying at 10.
- **The status/criticality trends were fiction.** It applied each
  asset's *current* `status`/`criticality` against its *creation* date,
  so "Retired" pretended an asset was retired the day it was created.
- **History rewrote itself** every refetch (deletes vanished from the
  past) and was bounded to the loaded page.

## Design

Ride the existing daily-snapshot pipeline that already powers the
executive-dashboard compliance trend — the same model the user asked
for ("move per 24hrs, same as the compliance trend logic"):

```
compliance-snapshot cron (0 5 * * *, daily 05:00 UTC)
   └─ generateSnapshotForTenant  → upsert ComplianceSnapshot(tenantId, snapshotDate)
        └─ DashboardRepository.getAssetSummary  (NEW)
getComplianceTrends(ctx, days)   → TrendDataPoint[] (now carries asset fields)
   └─ AssetsClient useQuery /dashboard/trends?days=30 → KpiFilterCard sparkline
```

One frozen point per tenant per day. `getAssetSummary` counts exclude
soft-deleted rows (`deletedAt: null`) so the series mirrors the live
table.

## Files

| File | Role |
|------|------|
| `prisma/schema/compliance.prisma` | +4 columns on `ComplianceSnapshot` (assetsTotal/Active/HighCriticality/Retired) |
| `prisma/migrations/20260607210000_compliance_snapshot_asset_kpis/` | additive `INT NOT NULL DEFAULT 0` (backfills existing rows to 0) |
| `src/app-layer/repositories/DashboardRepository.ts` | `AssetSummary` type + `getAssetSummary()` |
| `src/app-layer/jobs/snapshot.ts` | wire `getAssetSummary` into the per-tenant `Promise.all` + upsert payload |
| `src/app-layer/usecases/compliance-trends.ts` | `TrendDataPoint` + `toDataPoint` carry the asset fields |
| `src/app/t/[tenantSlug]/(app)/assets/AssetsClient.tsx` | sparklines from `/dashboard/trends` useQuery; `buildCumulativeTrend` deleted |
| `src/app/t/[tenantSlug]/(app)/assets/asset-kpi-trend.ts` | **deleted** (obsolete client-side builder) |
| `src/lib/queryKeys.ts` | `assets.trends(tenantSlug)` key (child of `assets.all` → invalidation cascades) |

## Decisions

- **Extended `ComplianceSnapshot` rather than a new `AssetSnapshot`
  table.** Assets are a compliance domain; the daily job, cron, and
  weekly digest already loop per tenant — adding 4 columns + one
  aggregate is the least plumbing for identical behaviour.
- **Reused `getComplianceTrends` / `/dashboard/trends`** rather than a
  dedicated asset-trends endpoint. The Assets page calls the same
  endpoint the dashboard does; gated by `assertCanRead` (any member).
- **No backfill.** Snapshots can't reconstruct past daily totals, so
  the sparkline starts as a single point and grows one real point per
  day from ship date — the first ~2 weeks render without a sparkline
  (`<2` points). Same property the compliance trend already has; the
  `KpiFilterCard` already no-ops below 2 points.
- **Kept `KpiFilterCard` untouched.** It was always purely
  presentational — only the data source changed. The presentational
  contract test (renders chart at ≥2 points) stays; the
  `buildCumulativeTrend` unit block was removed with its source.

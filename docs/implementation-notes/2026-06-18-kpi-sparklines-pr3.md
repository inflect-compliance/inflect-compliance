# 2026-06-18 — KPI sparklines PR3 (Risk avgScore/overdue + Tests KPI row)

**Commit:** `<sha>` feat(charts): KPI sparklines PR3 — risk avgScore/overdue + Tests KPI row

Final wave of the canonical KPI-sparkline rollout (PR1 #1113, PR2 #1114).
Two independent parts, one PR. Follows the PR2 forward-only NULLABLE pattern
exactly — no backfill, no fake ramp.

## Design

Same pipeline as PR1/PR2: the daily `ComplianceSnapshot` job freezes one row
per tenant per day; `GET /dashboard/trends` serves them; `useKpiTrends` fetches
once (shared cache key) and `buildKpiSparklines` / `buildKpiSparklineNullable`
shape per-card series. No new pipeline code — PR2 already introduced the
nullable builder.

**Part A — Risk avgScore + overdue cards.** The Risks KPI strip had `total`
and `open` sparklined since PR1; `avgScore` and `overdue` were value-only. Added
two snapshot columns:
- `risksAvgScore Float?` — `db.risk.aggregate({ _avg: { inherentScore } })` over
  non-deleted risks. NULL when the tenant has no risks (truthful "no data").
- `risksOverdueReview Int?` — `db.risk.count` where `nextReviewAt < now`.

Both NULLABLE so pre-existence rows read NULL, not a false 0. The avgScore card
keeps its `.toFixed(1)` string headline value; the sparkline value comes from
the trend column.

**Part B — Tests KPI row.** The `tests/page.tsx` rollup had only display-only
`KPIStat` headline figures (Total/Overdue/Failed/Passed) and no sparklines, no
clickable filter wiring. Replaced that strip with the canonical
`KpiFilterCard` + `useKpiFilter` row used by every other entity: **Total /
Active / Paused / Archived**, each card toggling the table's `status` filter.
Four snapshot columns:
- `testPlansTotal Int @default(0)` — anchors the leading-zero trim (like every
  other entity total), so `buildKpiSparklines` can drive it.
- `testPlansActive/Paused/Archived Int?` — nullable status buckets via
  `db.controlTestPlan.groupBy({ by: ['status'] })`. (ControlTestPlan has no
  soft-delete, so `where: { tenantId }`.)

The old Overdue/Failed/Passed headline figures are dropped — those concerns
remain reachable through the Due / Last-Result filter dropdowns, and the
canonical KPI row is status-bucket-filterable like the other six entities.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | +2 risk cols, +4 test-plan cols on `ComplianceSnapshot` |
| `prisma/migrations/20260618120000_kpi_risk_snapshot_cols/migration.sql` | risksAvgScore + risksOverdueReview (nullable) |
| `prisma/migrations/20260618120001_kpi_test_plan_snapshot_cols/migration.sql` | testPlansTotal (NOT NULL DEFAULT 0) + 3 nullable buckets |
| `src/app-layer/jobs/snapshot.ts` | risk aggregate/count + test-plan groupBy/count; write into upsert |
| `src/app-layer/usecases/compliance-trends.ts` | TrendDataPoint + toDataPoint expose the 6 new fields |
| `src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx` | avgScore + overdue cards sparkline via nullable builder |
| `src/app/t/[tenantSlug]/(app)/tests/page.tsx` | canonical KpiFilterCard row + useKpiFilter status wiring + sparklines |
| `tests/guards/kpi-sparkline-canonical.test.ts` | add Tests to the CLIENTS adoption map |
| `tests/unit/compliance-snapshot.test.ts` | mock risk.aggregate + controlTestPlan; assert PR3 fields |

## Decisions

- **Forward-only NULLABLE, no backfill.** Same operator decision as PR2 — old
  snapshot rows read NULL ("no data, don't plot"); the chart trims the NULL
  prefix so cards render empty until ~2 days of history accrue. No prod backfill
  job, so no GAP-21-style deploy crash-loop risk.
- **`testPlansTotal` is `@default(0)`, not nullable.** The canonical guard
  requires each client to call `buildKpiSparklines(` (not just the nullable
  variant), which needs a non-null anchor. The total card uses the PR1 pattern
  (leading-zero trim gated on the total); the three status buckets stay nullable.
- **Snapshot overdue cutoff captured once** (`snapshotComputedAt`) so every
  count in a snapshot shares one instant, matching the UI's overdue test.

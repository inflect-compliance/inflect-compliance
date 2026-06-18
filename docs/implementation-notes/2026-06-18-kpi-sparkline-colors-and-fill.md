# 2026-06-18 — KPI sparkline colours + full-coverage fill

**Commit:** `<sha>` feat(charts): distinct sparkline colours + Tasks/dueWeek series + backfill

Two fixes on top of the canonical KPI-sparkline pipeline (PR1 #1113, PR2 #1114,
PR3 #1116):

## 1 — Distinct colours per page

`<KpiFilterCard>` defaults every sparkline to `brand` unless the page passes
`accent`/`sparklineVariant`. Only Assets passed a per-card `accent`, so every
other page's sparklines were all one colour.

New canonical allocator in `src/lib/charts/kpi-trends.ts`:

```
assignSparklineVariants(keys, rng = Math.random) → Record<key, MiniAreaChartVariant>
```

Fisher–Yates shuffles the 6-colour palette (`SPARKLINE_VARIANTS`) with `rng`
and assigns one colour per key in order — **no two cards on a page share a
colour** for ≤ 6 keys (every entity page has ≤ 4). Random per call; pages call
it once in `useMemo([])` so the allocation is stable within a page view and
reshuffles on the next load. `rng` is injectable so the distinctness invariant
is unit-testable.

The other seven KPI pages (Controls, Risks, Evidence, Policies, Vendors, Tests,
Tasks) compute a colour map and pass `sparklineVariant={colors[key]}` per card.
**Assets is left as-is** — it already has distinct colours via its curated
per-card `accent` palette (indigo/emerald/rose/slate), which is the reference
the rest now match. Adding the allocator to Assets would have collided with the
deliberate "Assets uses accent, not explicit sparklineVariant" contract locked
by `tests/rendered/kpi-filter-card-accent.test.tsx`.

## 2 — Fill the missing series

The cards listed as "missing" were either unwired (Tasks) or empty because
their snapshot columns are forward-only and merged the same day (Risks
avg/overdue, Tests, Evidence/Policy buckets, Vendors active/critical).

- **Tasks** had a KPI strip but no sparklines. Wired `useKpiTrends` +
  `buildKpiSparklines` for total/open/overdue (existing columns) and
  `buildKpiSparklineNullable` for "Due this week" via a new
  `tasksDueSoon7d Int?` column (snapshot counts `dueAt` within +7d). `tasksTotal`
  is now exposed on `TrendDataPoint` (it existed in the snapshot but wasn't in
  the DTO). Tasks added to the canonical guard's CLIENTS map.
- **Backfill** (`scripts/backfill-kpi-snapshot-cols.ts`) seeds the forward-only
  columns on historical `ComplianceSnapshot` rows with each tenant's CURRENT
  value, so the new sparklines render immediately (flat baseline → real
  movement forward) instead of waiting ~2 days. `--dry-run` default,
  `--execute` to write; idempotent (only touches NULL rows / `testPlansTotal`
  where 0); per-tenant RLS via `withTenantDb`. Run as a one-off on the VM after
  the migrations + worker are live.

## Files

| File | Role |
| --- | --- |
| `src/lib/charts/kpi-trends.ts` | `SPARKLINE_VARIANTS` + `assignSparklineVariants` allocator |
| `prisma/schema/compliance.prisma` + `…/20260618130000_kpi_tasks_due_soon_col` | `tasksDueSoon7d Int?` |
| `src/app-layer/jobs/snapshot.ts` | compute `tasksDueSoon7d` (dueAt within +7d) |
| `src/app-layer/usecases/compliance-trends.ts` | expose `tasksTotal` + `tasksDueSoon7d` |
| `src/app/t/[tenantSlug]/(app)/{assets,controls,risks,evidence,policies,vendors,tests,tasks}/…` | colour map + per-card `sparklineVariant`; Tasks gets full sparkline wiring |
| `scripts/backfill-kpi-snapshot-cols.ts` | one-off forward-only-column backfill |
| `tests/guards/kpi-sparkline-color-distinct.test.ts` | colour-distinctness ratchet (runtime invariant + structural wiring) |
| `tests/guards/kpi-sparkline-canonical.test.ts` | add Tasks |
| `tests/unit/charts/kpi-trends.test.ts` | allocator unit tests |

## Decisions

- **Colours random per mount, not seeded.** The operator asked for random
  allocation; `useMemo([])` keeps it stable within a view so it doesn't flicker
  on re-render, but it reshuffles on reload. The ratchet tests the distinctness
  invariant (over a real-random sweep), not specific colour assignments.
- **Backfill writes a flat baseline.** Historical bucket counts can't be
  reconstructed, so past rows get today's value. Chosen over forward-only-wait
  to make the cards visible now; the flat line bends as real movement accrues.
- **Allocator overrides Assets' accent sparkline colour** but keeps the accent
  gradient — one canonical rule for sparkline colour across all pages, Assets'
  distinctive value gradients preserved.

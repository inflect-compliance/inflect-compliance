# 2026-06-26 — Bundle perf: icon tree-shaking + First-Load-JS budgets

**Commit:** `<pending>` perf(bundle): icon tree-shaking + First-Load-JS budgets + lazy heatmap

## What shipped (and what was already done)

The audit found the obvious lazy-loading is **already in place**, so this
PR adds the genuinely-missing pieces rather than re-doing or regressing
existing work:

- **Icon tree-shaking.** The in-repo Nucleo barrel
  (`src/components/ui/icons/nucleo/index.ts`) re-exports ~hundreds of
  single-icon modules via `export *`. Added it to
  `next.config.js::optimizePackageImports` (same mechanism as
  `lucide-react`) so Next rewrites `import { X } from …/nucleo` to the
  specific icon module — unused icons never reach a page chunk. All 29
  consumers already use named imports (0 wildcards), so no call-site
  churn was needed; the `icon-import-discipline` ratchet locks that.

- **First-Load-JS size budgets.** `bundle-size-budget.test.ts` reads
  Next's `app-build-manifest.json` and fails any route over its budget
  (allowlist shape — grow the budget in the same diff). It runs in the
  `Bundle Analyze` workflow (which builds); in the no-build jest job it
  SKIPS, so it never false-fails an unbuilt tree.

- **Lazy heatmap.** `RisksClient` statically imported `RiskMatrix` (654
  lines, visx-heavy). The default risks view is `register` (the table),
  so the heatmap only renders on a view toggle → converted to
  `next/dynamic({ ssr: false })` with a skeleton fallback. Its chunk now
  ships only when a user switches to the heatmap view.

## What was already done / deliberately not touched

- **Dashboard charts** (DonutChart, TrendCard, RiskMatrix, ExpiryCalendar)
  are ALREADY `next/dynamic` in `DashboardClient`. Detail-page panels
  (BowTie, FAIR, traceability) are ALREADY dynamic. Not duplicated.
- **Modals stay static BY DESIGN.** `NewRiskModal`, `NewControlModal`,
  the evidence modals, etc. were previously `next/dynamic` and
  **reverted** (documented in the client files) because the `next dev`
  JIT race made them flaky in serial E2E (Playwright clicked the trigger
  before the chunk compiled). They're small ("bundle cost negligible").
  Re-converting them would reintroduce a known regression — so this PR
  does not.

## Deferred (honest)

- **RSC refactor** (lifting one-`useState` client islands to server
  components) — real, per-page refactoring; its own roadmap item, not
  bundled here.
- **Budget calibration + measurement.** Budgets are starting targets, not
  measured ceilings (the build runs in CI, not here). Post-deploy
  checklist: tune budgets to ~10% above real First Load JS from the first
  analyze build; record p95 INP per route before/after from RUM (no
  baseline exists yet — no fabricated numbers).

## Files

| File | Role |
|------|------|
| `next.config.js` | nucleo barrel → `optimizePackageImports` |
| `src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx` | `RiskMatrix` → `next/dynamic` (heatmap view only) |
| `tests/guards/icon-import-discipline.test.ts` | no wildcard/default nucleo imports |
| `tests/guardrails/bundle-size-budget.test.ts` | per-route First Load JS budgets (skip-without-build) |
| `.github/workflows/bundle-analyze.yml` | runs the budget gate after the analyze build |

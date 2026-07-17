# 2026-07-18 — Test scheduling model unification: one due signal, honest counters, in-context plan detail (PR-Q)

**Commit:** `<pending> feat(tests): reconcile due clocks, collapse overdue counters, retire /tests/upcoming, remove inert AUTOMATED toggle, tenant-wide plan detail + SWR migration (Prompt 2)`

## Design

The tenant-wide `/tests` surfaces carried two disagreeing "due" clocks, three
overdue counters, an orphaned endpoint, a cosmetic AUTOMATED toggle, and a home
that couldn't open its own plans. Five reconciliations.

### 1. One authoritative due signal — `effectiveDueAt`

`ControlTestPlan` has `nextDueAt` (from the `frequency` enum, incl. `AD_HOC`) and
`nextRunAt` (from a cron `schedule`). The old queries filtered
`frequency != 'AD_HOC'` and never looked at `nextRunAt`, so a plan given a cron
cadence (nextRunAt set, frequency still AD_HOC — the NewTestPlanModal default)
was permanently invisible in `/tests/due`. `due-planning.ts` now exports
`effectiveDueAt(plan)` = earliest non-null of the two clocks, and `dueOrBeforeWhere`
= `OR:[{nextDueAt},{nextRunAt}]`. Every due/overdue surface —
`getDueQueue`, `runDuePlanning`, dashboard `overduePlans`, `listAllTestPlans`
(overdue/next7d filters) — is driven from these, so the counts can't diverge. The
queue sorts by `effectiveDueAt` in memory (Prisma can't order by a min of two
columns).

### 2. Overdue counters collapsed to one authoritative count + cross-link

`overduePlans` (now reconciled) is THE authoritative overdue count — the same
number `/tests` and `/tests/due` show. It was fetched but never rendered; the
dashboard now renders it as a `KPIStat` card that cross-links to `/tests/due`.
The automation section's `overdueScheduled` stays, clearly labeled "Overdue
scheduled" — the SUBSET of overdue plans that are on an automation cadence.

### 3. `/tests/upcoming` retired

`getUpcomingTests` + `GET /tests/upcoming` had no UI consumer (the dashboard's
"upcoming" list is built by `getTestDashboard`, a separate query). Both deleted.
`UpcomingTestDto` is retained — it's still the shape of `getTestDashboard`'s own
upcoming items.

### 4. AUTOMATED toggle removed

`NewTestPlanModal`'s MANUAL/AUTOMATED toggle (and `TestPlansPanel`'s method
select) POSTed a `method` that `createTestPlan` never mapped to an
`automationType` or a schedule — "AUTOMATED" plans were inert and the badge lied.
No SCRIPT/INTEGRATION engine exists (PR-P), so both toggles are removed. A plan
creates MANUAL; a cadence is chosen via the frequency picker (a real due signal,
with a hint) or configured afterward via the plan's schedule section.

### 5. In-context plan detail + `useTenantSWR` migration

The control-scoped detail page body was extracted into a shared
`TestPlanDetailView({ planId, context })`; a new tenant-wide route
`/tests/plans/[planId]` mounts it with `context="tests"` (breadcrumbs Dashboard →
Tests → {plan}, back to `/tests`), and the control-scoped route mounts it with
`context="control"`. `/tests` plan links (name cell + row-click) and
`/tests/due` links now open the plan in-context without leaving the tree. The
three home pages (`/tests`, `/tests/due`, `/tests/dashboard`) migrated off
`useEffect`+`setState` to `useTenantSWR` (new `CACHE_KEYS.tests` resource); the
`react-hooks/set-state-in-effect` disables are gone.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/due-planning.ts` | `effectiveDueAt` + `dueOrBeforeWhere`; all four due queries reconciled |
| `src/app-layer/usecases/test-scheduling.ts` | Deleted `getUpcomingTests` + `clamp`; kept `UpcomingTestDto` for the dashboard |
| `src/app/api/t/.../tests/upcoming/` (deleted) | Orphaned route removed |
| `src/app/t/.../tests/_components/NewTestPlanModal.tsx` | Removed AUTOMATED toggle; frequency hint |
| `src/components/TestPlansPanel.tsx` | Removed inert method select |
| `src/app/t/.../tests/page.tsx`, `tests/due/page.tsx`, `tests/dashboard/page.tsx` | SWR migration; effective-due; plan links → `/tests/plans/[id]`; authoritative overdue card |
| `src/app/t/.../tests/_components/TestPlanDetailView.tsx` (new) | Shared plan-detail view |
| `src/app/t/.../tests/plans/[planId]/page.tsx` (new) | Tenant-wide plan-detail route |
| `src/app/t/.../controls/[controlId]/tests/[planId]/page.tsx` | Thinned to a wrapper |
| `src/lib/swr-keys.ts` | New `CACHE_KEYS.tests` resource |
| `src/lib/nav/{page-segregation,canonical-parents}.ts` | New route classified SUBPAGE → `/tests` |

## Decisions

- **Coalesce, don't backfill.** Making `nextDueAt` authoritative would need a data
  migration to derive it from every cron schedule. The `OR`-over-both-clocks
  reconciliation needs no backfill and is correct the moment either clock is set.
- **Remove the toggle, not map it.** PR-P established there's no engine; a "map
  method→automationType" would still have nothing to map to. Removing keeps the
  create surface honest; scheduling is the schedule section's job.
- **Delete `/tests/upcoming`, keep `UpcomingTestDto`.** The endpoint was dead but
  its DTO shape is still produced by `getTestDashboard`.
- **Shared view, two thin routes.** Extracting `TestPlanDetailView` avoids
  duplicating 400 lines and gives both the control-scoped and tenant-wide routes
  one source of truth; `context` only swaps breadcrumbs/back.

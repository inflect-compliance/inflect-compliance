# 2026-07-14 — Test sub-nav, dashboard de-dup, coverage disambiguation (R3-P3)

**Commit:** `<pending> feat(tests): sub-nav spine, dashboard de-dup, coverage/readiness disambiguation`

## Design

Three problems, one PR:

1. **Three "coverage/readiness" concepts collided.** "Framework Test Coverage"
   (test-plan/run coverage, on the test dashboard), "Readiness" (audit-cycle
   weighted score), and the "/coverage" **Control coverage map** (risk↔control↔
   asset protection) all read as the same idea. The two that live one click
   apart — test-dashboard coverage and /coverage — now carry reciprocal
   disambiguation captions + cross-links so "test coverage" is never confused
   with "protection coverage."

2. **The test dashboard duplicated itself.** The pass/fail/inconclusive
   distribution rendered **twice** (a legacy progress-bar "Result Distribution"
   card *and* a G-2 donut, from the same counters), and the KPI strip restated
   the plan-total + overdue counts that already live on /tests and /tests/due.
   De-dup: the G-2 donut is removed (the always-rendered card stays as the
   single distribution); the two restated **count** KPIs are dropped from the
   dashboard — its job is rates & trends, the lists own the counts.

3. **The three test surfaces had no shared spine.** /tests, /tests/due, and
   /tests/dashboard were linked only by ad-hoc icon buttons scattered per page,
   with no consistent "where am I" affordance. A single `TestsSubNav`
   (Tests · Due · Dashboard, active-highlighted) now sits on all three,
   replacing the scattered cross-links.

Plus polish: /tests's H1 is now visible (was `sr-only`); /tests/due and
/tests/dashboard gained breadcrumbs (Dashboard › Tests › …) as their parent-nav,
replacing per-page back affordances.

## Files

| File | Role |
| --- | --- |
| `src/app/t/[tenantSlug]/(app)/tests/_components/TestsSubNav.tsx` | Shared Tests/Due/Dashboard sub-nav spine |
| `src/app/t/[tenantSlug]/(app)/tests/page.tsx` | Sub-nav; visible H1; dropped redundant due/dashboard icon buttons |
| `src/app/t/[tenantSlug]/(app)/tests/due/page.tsx` | Sub-nav + breadcrumbs (replaces BackAffordance + inline links) |
| `src/app/t/[tenantSlug]/(app)/tests/dashboard/page.tsx` | Sub-nav + breadcrumbs; KPI strip trimmed to rates; coverage cross-link |
| `src/components/TestDashboardG2Section.tsx` | Duplicate result-distribution donut removed (grid 3→2) |
| `src/app/t/[tenantSlug]/(app)/coverage/CoverageClient.tsx` | Reciprocal disambiguation caption → test dashboard |
| `src/lib/nav/page-segregation.ts` | /tests/due + /tests/dashboard exempt from back-affordance (use breadcrumbs) |

## Decisions

- **Keep the always-rendered card, drop the conditional donut.** The G-2 donut
  only renders when automation data is present; removing it (not the card)
  guarantees the distribution always shows exactly once.
- **Dashboard = rates & trends; lists = counts & rows.** The restated
  Active-Plans / Overdue-Plans count cards move off the dashboard; the four rate
  KPIs (completion / pass / fail / evidence) are dashboard-unique and stay.
- **Breadcrumbs over back affordance.** /due + /dashboard navigate via
  PageBreadcrumbs (clickable ancestor trail) + the sub-nav — the richer form
  PageHeader itself prefers — so they're exempt from the back-affordance ratchet
  with a written reason.
- **Cross-links, not a rename.** The three surfaces keep their names ("Framework
  Test Coverage", "Control coverage map", "Readiness"); the confusion was
  proximity without signposting, so the fix is reciprocal captions + links, not
  a churny rename.

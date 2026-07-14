# 2026-07-14 — Unified test surface (R3-P1)

**Commit:** `<pending> feat(tests): unify manual test plans and automated checks on /tests`

## Design

The test subsystem split along a fault line the UI never reconciled globally:

- **Manual `ControlTestPlan`** — an operator-authored plan (method /
  frequency / owner) that produces `ControlTestRun` results. Surfaced on
  `/tests` (tenant-wide list) and each control's *Test plans* tab.
- **Automated `IntegrationExecution`** — a provider check
  (`provider` / `automationKey` / `status`) recorded against a control by a
  connector. Surfaced ONLY on a single control's *Checks* tab; there was no
  tenant-wide home, so a user could not see "what did my automated checks do
  across every control".

Both answer the same operator question — *"is this control being verified, and
did the last verification pass?"* — but a user landing on `/tests` saw only
half the story with no signpost that the other half existed.

R3-P1 reconciles them on one surface without merging the underlying models
(they have genuinely different lifecycles):

1. **Tenant-wide checks home.** New `listAllControlChecks(ctx, {limit})`
   usecase + `GET /api/t/{slug}/tests/checks` route return every
   `IntegrationExecution` for the tenant (newest first, bounded `take`), each
   joined to its owning control. `/tests` gains a **Plans / Automated checks**
   view toggle backed by this route (lazy-fetched on first switch to Checks).
2. **Global tests-vs-checks explanation.** A one-line description on `/tests`
   states the manual-plan vs automated-check distinction — previously only
   discoverable by opening a control and reading two separate tab bodies.
3. **Method column.** The canonical `/tests` plan list now shows each plan's
   method (Manual / Automated) as a badge — the manual/automated split is now
   legible at the list level, registered in the columns dropdown.
4. **Global create.** `NewTestPlanModal` lets a user pick a control (+ name /
   method / frequency) and create a plan from `/tests`. It POSTs to the same
   control-scoped `POST /controls/{id}/tests/plans` route the per-control panel
   uses — no new write path, no duplicated validation.
5. **Inheritance parity.** `InheritedTestPlansPanel` (asset/risk detail) rolls
   up manual test PLANS from mapped controls but not automated checks; it now
   carries a note saying so, so the inherited picture doesn't read as silently
   half-complete.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/integrations.ts` | `listAllControlChecks` — tenant-wide check history (bounded, tenantId-scoped) |
| `src/app/api/t/[tenantSlug]/tests/checks/route.ts` | Read route (`controls.view`) backing the Checks view |
| `src/app/t/[tenantSlug]/(app)/tests/page.tsx` | Plans/Checks toggle, method column, checks table, global create button |
| `src/app/t/[tenantSlug]/(app)/tests/_components/NewTestPlanModal.tsx` | Global "Create test plan" modal (control picker → control-scoped POST) |
| `src/components/InheritedTestPlansPanel.tsx` | Note that automated checks aren't rolled up into the inherited view |
| `messages/{en,bg}.json` | New `controlTests.unified.*`, `method.*`, `checkStatus.*`, `checksList.*`, `panels.inherited.checksNote` (parity locked) |
| `public/openapi.json` | Regenerated for the new `/tests/checks` path |
| `tests/guards/p1-unified-test-surface.test.ts` | Structural ratchet for the five unification points |

## Decisions

- **Two models, one surface — not a merge.** `ControlTestPlan` and
  `IntegrationExecution` keep distinct lifecycles (an operator authors + runs a
  plan; a connector emits a check). Unifying at the *view* layer answers the
  operator's question without a lossy schema merge.
- **Checks are read-only and gated by `controls.view`.** Automated checks are
  control-execution data — same gate as the per-control Checks tab. No new
  permission key.
- **Global create reuses the control-scoped write.** The modal picks a control
  then POSTs to `/controls/{id}/tests/plans` — the create path, validation, and
  audit trail stay in one place.
- **Bounded checks query.** `listAllControlChecks` carries `take: 200` by
  default (Layer-D2 unbounded-findMany budget) — the surface is a recent-history
  view, not an export.

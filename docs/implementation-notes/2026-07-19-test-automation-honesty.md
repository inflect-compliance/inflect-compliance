# 2026-07-19 — Automated-execution honesty + test-surface polish (PR-DD)

**Commit:** `<sha> fix(tests): label integration checks as non-effectiveness telemetry, localize plan-detail badges, drop the stale TODO`

## Design

The automated-execution capability gap plus a few polish items. Two of the four
were "decide and note" questions; both decisions and their evidence are here.

### 1 — Automated execution: LABEL the surface, don't fake the capability

**The state, verified rather than assumed — and there are TWO automation paths,
only one of which was dishonest:**

| Path | Executes? | Surface |
| --- | --- | --- |
| **Integration checks** (`automation-runner.ts`) | **Yes, genuinely** — `provider.runCheck()` is real | Checks tab was **already honest** |
| **Test-plan automation** (`control-test-runner.ts`) | **No** — handler registry is empty | Schedule copy **overpromised** |

- No `runnerHandlerRegistry.register(...)` call exists anywhere in `src/` — the
  SCRIPT/INTEGRATION handler registry is empty in production, so a scheduled
  "automated" plan falls back to a PLANNED "awaiting manual completion" run.
- `createAutomatedTestRun` (the integration→test-run bridge) has exactly **one**
  caller: the manual `POST /tests/plans/[planId]/automation-run` route. Nothing
  produces automated *test runs* automatically.
- Integration checks DO run for real; what they don't do is feed control-test
  effectiveness. The Checks tab already said so (a PR-P `telemetryNote` states
  they "are not test runs and do not count toward the test-run effectiveness
  pass-rate"), so it was left untouched — the honest label was already there.

**Decision: option (b) — make the surface honest; do NOT wire the bridge.**

Wiring it would require inventing two things that do not exist: a
control↔integration-check **mapping** (which check attests which control?) and a
**result-mapping policy** (does a failed AWS posture check mean the control
FAILED, or that the collector had a bad day?). Manufacturing those to make a
check "count" toward effectiveness would generate assurance from telemetry that
was never designed as a control test — precisely the failure mode PR-CC closed
one PR earlier, where INCONCLUSIVE runs were marking controls "tested &
on-schedule". A wrong number here is worse than an absent one: an auditor acts
on it.

Notably **the backend is already honest**: when no handler is registered the
runner delegates to the MANUAL path, leaving a PLANNED "awaiting manual
completion" run rather than completing as a misleading INCONCLUSIVE no-op. The
gap was purely surface, and specifically in the **schedule** copy:

- The cadence descriptions said "**Runs** every day at 09:00" — a direct claim
  that the product executes the test. With an empty registry it does not. They
  now say "**Creates a run** every day at 09:00", which is exactly what happens.
- The schedule section gained a plain note under its heading: *a schedule
  creates a test run for someone to complete — it does not run the test itself.*
- Scheduled instantiation is real and useful — it is **not** removed, only
  described accurately.

The Checks tab needed no change. That is worth recording: the initial read of
this item assumed integration checks were inert display-only telemetry, and the
audit found the opposite — they execute, and their tab was already correctly
labelled. The dishonest surface was the one that *looked* implemented.

**What wiring it would take, when someone wants it:** a persisted
check↔control mapping, an explicit per-check result policy (including an
"inconclusive" arm for collector failures), evidence provenance from the check
payload, and at least one registered handler. The seam (`runnerHandlerRegistry`,
`createAutomatedTestRun`) is already shaped for it.

### 2 — Per-step results: keep the honest label

`ControlTestStep` has no result column, and the run page's per-step checkboxes
are ephemeral (already labelled as guidance).

**Decision: leave the label; do not add a per-step result model.** Persisting
per-step outcomes is a new model + migration + UI, and it forces a semantic
question the product hasn't answered: can a run be *partially* passed, and if so
what does that mean for effectiveness (which is currently a clean PASS/FAIL
rate)? That is a feature with a design debate attached, not a residual. The
current label is accurate today, which is the bar this PR holds things to.

Per-step evidence for audit is available in the meantime through the run's
`notes` + attached evidence, which is where testers already record what they saw.

### 3 — Plan-detail badges localized
`TestPlanDetailView` rendered raw `{plan.status}` / `{plan.method}` /
`{run.status}` / `{run.result}` while the list page next to it rendered
localized labels from maps that already existed. The detail view now uses the
same maps (reused, not re-hand-rolled) so the two surfaces read as one system.

### 4 — Stale TODO removed
`/tests` carried a migration TODO claiming fetch-on-mount; the page has been on
`useTenantSWR` for some time. Removed.

## Decisions

- **Honesty over capability theatre.** Two of these four items were invitations
  to either build something big or tell the truth cheaply. Both took the truth:
  an AUTOMATED affordance that never executes, or a checkbox that looks
  persisted, costs more trust than the missing feature does.
- **Verify before labelling.** The "no handler is registered" claim was checked
  against `src/` rather than taken from the code comment that asserted it — the
  comment happened to be right, but a stale comment is exactly what item 4 was.
- **Both deferrals record their unlock conditions** so the next person picks up
  a decision, not a mystery.

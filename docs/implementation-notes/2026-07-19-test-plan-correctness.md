# 2026-07-19 — Test-plan correctness: method drift, archive, verdict gate, overdue (PR-CC)

**Commit:** `<sha> fix(tests): derive method from automationType, allow single-plan archive, gate attestation on a real verdict, reconcile overdue`

## Design

Two reachable edit-form bugs plus three correctness residuals in the
tested-state and overdue counters.

### 1 — The inert AUTOMATED toggle (method ↔ automationType drift)
`updateTestPlan` had only a `method === 'MANUAL'` reconciliation branch, so
PATCHing `method: 'AUTOMATED'` set the column while `automationType` stayed
MANUAL and `schedule` stayed null — the badge said AUTOMATED and nothing was
scheduled. That violated the documented invariant that **method is a derived
projection of automationType and can never drift**.

**Fix: the free method toggle is gone.** `method` is now derived everywhere from
`automationType` via `deriveMethodFromAutomationType`. The toggle, its state,
and `method` on both Zod schemas and both usecase input types were removed; the
schemas `.strip()`, so a client that still asserts `method` has it silently
discarded rather than honoured. `updateTestPlan`'s reconciliation became
**symmetric**: any `automationType` write recomputes `method`, and reverting to
MANUAL still strips `schedule`/`nextRunAt`. Automation is changed by setting
`automationType` + `schedule` in the schedule section — never by typing
"AUTOMATED".

One residual was closed beyond the brief: `TestPlanRepository.create` still
accepted a `method` input (defaulting to MANUAL), a latent re-drift vector for
any future direct caller. It now takes `automationType` and derives. To let the
repository derive without a repository→usecase import (which would invert the
layer dependency — no repository imports a usecase anywhere in this codebase),
the helper moved to `domain/test-plan-method.ts`; `control-test.ts` imports and
re-exports it so existing call sites are unchanged. **Every writer of `method`
in the codebase now routes through that one function.**

### 2 — Single-plan ARCHIVE 400'd
The edit form offered ARCHIVED but `UpdateTestPlanSchema.status` was
`enum(['ACTIVE','PAUSED'])`, so archiving from the detail page 400'd while the
bulk path archived fine. ARCHIVED is now accepted and threaded through.

Bulk archive sets `status` **only** — it does not clear `schedule`/`nextRunAt`,
which is safe because the runner guards `status !== 'ACTIVE'` and the dashboard
queries filter to ACTIVE. The single-plan path matches that exactly, and a test
asserts both paths reach an identical end state so they can't diverge later.

### 3 — INCONCLUSIVE runs no longer advance the tested-state
`attestControlTested` stamped `Control.lastTested` + rolled `nextDueAt`
unconditionally, *before* the result branch, on all three completion paths. So a
control whose only runs were INCONCLUSIVE read "tested & on-schedule" while its
effectiveness stayed null — a false assurance an auditor could act on.

The verdict is now a **required** parameter of `attestControlTested` (not
optional-defaulting-to-attest), so a completion path cannot silently attest by
forgetting the argument. A shared `isAttestingVerdict` (PASS/FAIL) gates both
the attestation and the plan-cadence roll at all three sites.

The **latent handler-error path** is the important one: the runner's catch block
coerces a handler *crash* into `result: 'INCONCLUSIVE'` and then attested. A
future flaky engine would have marked controls "tested & on-schedule" every time
it threw — silent, recurring, and indistinguishable from healthy automation.
That path is now gated too.

### 4 — The three overdue surfaces agree
`/tests` counted **every status** with a strict `<`; `/tests/due` and the
dashboard counted **ACTIVE-only** with `<=`. So a paused or archived past-due
plan showed as overdue in the list but not in the KPI.

One definition now, used by all three: **status ACTIVE, and the earlier of the
two due clocks at-or-before now**. ACTIVE-only is the right scope (pausing a
plan is a deliberate "stop expecting this"), and `<=` matches the `lte` the
authoritative DB queries already used.

### 5 — Stale-`nextRunAt` overdue pin + double-instantiation
A manual `completeTestRun` advanced only `nextDueAt`. Since
`effectiveDueAt = min(nextDueAt, nextRunAt)`, the stale *past* `nextRunAt`
pinned the plan as overdue on every surface until the scheduler next ticked —
no matter how recently it had actually been tested. Manual completion of a
scheduled plan now also rolls `nextRunAt` forward from the cron (via
`computeNextRunFromCron`; a null — unparseable cron — leaves the stored value
rather than silently clearing the schedule).

`runDuePlanning` also raced the scheduler: the scheduler claims a plan and
enqueues a runner job, and before the runner writes its row the
`PLANNED/RUNNING` idempotency filter sees nothing — so due-planning minted a
**second** PLANNED run for the same occurrence. Rather than add a cross-process
lock, the two are separated by **ownership**: `runDuePlanning` now queries
`schedule: null`, so it only instantiates runs for plans with no cron (the ones
nobody else will pick up). Disjoint input sets make the double-run impossible by
construction — no coordination to get wrong, and no ambiguity about which
component owns a plan.

## Files

| File | Role |
| --- | --- |
| `domain/test-plan-method.ts` | **new** — the single `method` derivation |
| `usecases/control-test.ts` | symmetric derivation; `isAttestingVerdict`; verdict-gated attest + cadence; `nextRunAt` roll |
| `repositories/TestPlanRepository.ts` | takes `automationType`, derives `method` |
| `repositories/TestRunRepository.ts` | plan select carries the schedule fields |
| `jobs/control-test-runner.ts` | verdict-gated attest + cadence (incl. the handler-error path) |
| `usecases/due-planning.ts` | `schedule: null` ownership split |
| `tests/_components/TestPlanDetailView.tsx` | method toggle removed |
| `lib/schemas/index.ts` | `method` dropped; ARCHIVED accepted |

## Decisions

- **Remove the toggle rather than implement it.** An AUTOMATED branch would
  have kept two writable sources for one fact. Deriving makes the invariant
  structural instead of maintained.
- **Verdict as a required argument.** Optional-with-a-default would have left
  the same hole open for the next call site.
- **ACTIVE-only + `<=` as the overdue definition** — matches the authoritative
  DB queries; a paused plan is a deliberate pause, not a failure.
- **Ownership, not locking, for the scheduler race.** Disjoint sets remove the
  race by construction; a shared claim would have needed correct coordination
  and left two components able to create runs for the same plan.

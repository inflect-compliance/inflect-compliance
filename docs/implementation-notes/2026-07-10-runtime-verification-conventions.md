# 2026-07-10 — Runtime-verification conventions (meta-ratchets)

**Commit:** _(pending)_ `test(guardrails): codify runtime-verification conventions`

## Design

The hardening wave (H1–H6, GAP-1..4) fixed a family of runtime failures that
share one shape: **the code was correct in isolation but wrong in conduct** —
an empty provider registry (H1), a check that went green on no data (H2), a
tenant model whose RLS existed but whose usecase path was never exercised
across two tenants (H5/GAP-1). Each was found by audit, after the fact.

This change turns those audit findings into **forward-locks** — structural
ratchets that fail CI the moment a new subsystem is added *without* the
corresponding runtime proof, so the convention is inherited by construction
rather than rediscovered.

Three ratchets + one contract doc:

1. **`provider-fail-closed-coverage.test.ts`** (extends H2) — auto-enumerates
   every registered `ScheduledCheckProvider` (via bootstrap + registry +
   `isScheduledCheckProvider`) and asserts each is mapped to a fail-closed test
   that references its check surface and carries an ERROR/NOT_APPLICABLE
   expectation. A new provider that isn't mapped fails CI.

2. **`tenant-isolation-forward-lock.test.ts`** (extends H5/GAP-1) — enumerates
   every tenant-scoped model (`parseSchemaModels`) and requires each to be
   classified `ISOLATION_TESTED` (a dedicated two-tenant behavioural test, file
   must exist) or `ISOLATION_BASELINE` (snapshot proven structurally by
   rls-coverage, behavioural test pending). A new model in neither fails CI.

3. **`runtime-wiring-coverage.test.ts`** (extends H1) — locks bootstrap
   reachability (web + worker import the bootstrap; the import populates the
   registry) and asserts every `executor-registry.ts` job is either scheduled
   in `schedules.ts` or listed in `ON_DEMAND_JOBS` with a reason. An unwired
   cron fails CI. Supersedes the O64VA branch's one-off
   `integration-bootstrap-runtime-wiring.test.ts` (which only checked the
   imports) by adding the job-scheduling axis.

4. **`docs/new-subsystem-checklist.md`** + a CLAUDE.md banner — the written
   contract (fail-closed · two-tenant behavioural · runtime wiring · outcome
   metric · authz gate), so the convention is discoverable, not tribal.

## Files

| File | Role |
| --- | --- |
| `tests/guardrails/provider-fail-closed-coverage.test.ts` | Registry-driven fail-closed coverage lock |
| `tests/guardrails/tenant-isolation-forward-lock.test.ts` | Every tenant model classified TESTED/BASELINE |
| `tests/guardrails/runtime-wiring-coverage.test.ts` | Bootstrap reachability + job scheduling lock |
| `docs/new-subsystem-checklist.md` | The written contract |
| `CLAUDE.md` | Banner pointer to the checklist |

## Decisions

- **Coverage-map ratchets, not universal behavioural generation.** Requiring a
  hand-written two-tenant test for all 154 existing tenant models (or a
  fail-closed driver for every provider) up front is unrealistic. The ratchets
  instead capture the *current* state (TESTED set + BASELINE snapshot / mapped
  providers) and force every NEW addition to be triaged. Coverage ratchets UP;
  the tail is a tracked follow-up, not a silent gap.
- **Baseline snapshot over per-model reasons.** The isolation lock stores the
  149 pre-existing tenant models as a flat `ISOLATION_BASELINE` array (one
  shared rationale) rather than 149 per-model reason strings — the value is the
  forward-lock on new models, and a flat list keeps the maintenance cost (on
  rename/delete) low.
- **The meta-lesson, stated in the doc:** structural ratchets certify shape,
  behavioural ratchets certify conduct. The platform now enforces both, so a
  subsystem can't ship shape-correct-but-conduct-wrong and pass CI.
- **Superseded, not duplicated.** The O64VA wiring test is intentionally NOT
  cherry-picked; `runtime-wiring-coverage.test.ts` is its superset. (See
  `docs/branch-divergence-o64va-analysis.md`.)

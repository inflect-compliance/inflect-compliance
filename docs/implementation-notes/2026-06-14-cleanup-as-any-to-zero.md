# 2026-06-14 — `as any` ratchet drives to zero

**Branch:** `claude/cleanup-1-as-any`

The CLAUDE.md staged-debt list said: *"The `as any` count is 4 (documented
staged debt)."* This PR closes the gap — every code-level `as any` cast
under `src/` is removed, the ratchet baseline drops to **0**, and the
companion CAPS table acknowledges that the 15 remaining surface-level
matches are all in docstrings/explanatory comments.

Both removed casts were hiding **runtime bugs**, not honest type lies.

## Bug 1 — onboarding step-name drift (3 `as any` casts)

`src/lib/schemas/onboarding.ts` exposes `OnboardingStepEnum` with the
long step names (`ASSET_SETUP`, `CONTROL_BASELINE_INSTALL`,
`INITIAL_RISK_REGISTER`, `TEAM_SETUP`, `REVIEW_AND_FINISH`). The
frontend wizard, the automation handler, and the repository all use
those long names — but the **`onboarding` usecase** had its own private
`STEP_ORDER` constant with abbreviated names (`ASSETS`, `CONTROLS`,
`RISKS`, `TEAM`, `REVIEW`).

The three `as any` casts in the `/api/t/[tenantSlug]/onboarding/step`
route handler were silently bridging that mismatch. At runtime the
usecase's `STEP_ORDER.indexOf(step)` returned `-1` for any non-COMPANY_PROFILE /
non-FRAMEWORK_SELECTION step, so `getNextStep()` returned the same
step unchanged and `totalSteps` was wrong for any progress calc that
used `STEP_ORDER.length` against actual completedSteps.

**Fix:** Align `STEP_ORDER` in the usecase to the canonical long
names. The three casts in the route become redundant and disappear.

## Bug 2 — retention-notifications task creator (1 `as any` cast)

`src/app-layer/jobs/retention-notifications.ts` generated tasks with
`priority: daysLeft <= 7 ? 'HIGH' : 'MEDIUM'` — but the Prisma
`WorkItemPriority` enum is `P0 | P1 | P2 | P3`. The `as any` was
hiding two things: (a) the missing required `createdByUserId` (a known
`#BUG-retention-task-creator`), AND (b) the priority literal mismatch
that would have thrown at runtime if a row ever passed the
duplicate-task filter.

**Fix:** Attribute the new task to the evidence's `ownerUserId` when
present, falling back to the tenant's first ACTIVE OWNER. Cache the
tenant-owner lookup per sweep to avoid N queries. Rows where neither
can be resolved are skipped with a `skippedNoActor` counter — better
to lose one notification than crash the sweep. Priority literal fixed
to `'P1' | 'P2'`.

## Ratchet movement

| Ratchet | Was | Now |
|---|---|---|
| `tests/guardrails/no-explicit-any-ratchet.test.ts` `CURRENT_BASELINE` | 4 | **0** |
| `tests/guards/no-explicit-any-ratchet.test.ts` CAPS `'as any'` | 18 | 15 |

The companion CAPS table drops from 18 → 15 because that ratchet does
not strip comments. The 15 remaining matches are all in docstrings
and explanatory comments (per CLAUDE.md the staged-debt narrative). A
future "comment hygiene" sweep could drop them too; this PR doesn't.

## Files

| File | Role |
|---|---|
| `src/app-layer/usecases/onboarding.ts` | `STEP_ORDER` aligned to schema |
| `src/app/api/t/[tenantSlug]/onboarding/step/route.ts` | 3 `as any` → typed `body.step` |
| `src/app-layer/jobs/retention-notifications.ts` | `createdByUserId` resolved properly; priority literal fixed |
| `tests/guardrails/no-explicit-any-ratchet.test.ts` | Baseline 4 → 0 + history note |
| `tests/guards/no-explicit-any-ratchet.test.ts` | CAPS `'as any'` 18 → 15 + history note |

## Test summary

- `npx jest tests/guardrails/no-explicit-any-ratchet.test.ts tests/guards/no-explicit-any-ratchet.test.ts tests/guards/codebase-hygiene-integrity.test.ts` — 24/24 across 3 suites.
- `npx jest tests/unit/usecases/onboarding.test.ts tests/unit/usecases/evidence-retention.test.ts tests/unit/evidence-retention.test.ts` — 48/48 across 3 suites.
- `npx tsc --noEmit` — zero new errors anywhere; both files compile cleanly without the casts.

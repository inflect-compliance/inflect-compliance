# 2026-06-27 — NIS2 self-assessment onboarding step (conditional)

**Commit:** `<pending>` feat(nis2): self-assessment step in onboarding (NIS2-gated)

## What

A new CONDITIONAL onboarding step, `NIS2_SELF_ASSESSMENT`, inserted
between `FRAMEWORK_SELECTION` and `ASSET_SETUP`. It renders the imported
NIS2 gap-assessment question set (Prompt 1 data layer; CC BY 4.0) ONLY
when NIS2 is among the selected frameworks; otherwise it is auto-skipped
and excluded from progress. Answering the questions is this PR — scoring,
findings/tasks, and a readiness score are a follow-up.

## Conditional-step insertion

`NIS2_SELF_ASSESSMENT` is added to `STEP_ORDER` (usecases/onboarding.ts),
`ONBOARDING_STEPS` + `SKIPPABLE_STEPS` (lib/schemas/onboarding.ts), and the
wizard's `STEPS`. Visibility is gated by `isStepApplicable(step, stepData)`:
the step is applicable iff `stepData.FRAMEWORK_SELECTION.selectedFrameworks`
contains NIS2.

**Stale-premise catch — casing.** The prompt specified
`selectedFrameworks.includes('NIS2')`, but the wizard's framework picker
stores **lowercase** keys (`key: 'nis2'`, also the
`FRAMEWORK_PACK_KEYS` casing). A strict `'NIS2'` check would mean the step
**never appears**. `isStepApplicable` (and the wizard's mirror
`stepApplicable`) therefore match **case-insensitively**. The ratchet
locks the lowercase `'nis2'` case explicitly.

`getNextStep` is now skip-aware: it walks past non-applicable steps, so a
non-NIS2 tenant completing FRAMEWORK_SELECTION lands directly on
ASSET_SETUP — the step is never even reachable.

## The applicable-step progress-denominator fix

`getOnboardingMetrics` previously divided by `STEP_ORDER.length` (a fixed
7, now 8). With a conditional step that would strand a non-NIS2 tenant at
7/8 = 88% forever. The fix filters `STEP_ORDER` by `isStepApplicable` for
**both** numerator and denominator; the wizard's progress bar does the
same against `visibleSteps`. Locked by the ratchet (asserts the source
filters and no longer divides by `STEP_ORDER.length`).

## Wizard integration

The wizard derives `visibleSteps = STEPS.filter(stepApplicable)` and
indexes `activeStepIdx` into THAT list (rail, "Step X of N", progress,
nav all use it). The NIS2 step renders `<Nis2SelfAssessmentStep>` and
drives its own completion: the generic footer "Continue" is suppressed on
that step; the component's "Complete assessment" → `POST .../complete`
(which also advances the onboarding step server-side) and "Skip for now"
→ `step` skip — both then re-sync via `loadState`.

## Autosave rationale

116 questions is far too many to risk a single batch submit. Every answer
is an independent `PUT .../answers/{questionId}` upsert (idempotent on
`[assessmentId, questionId]`). The user can leave and return; state is
re-fetched on mount. No "submit all".

## Resume-later surface

Onboarding is the FIRST entry point, not the only one. A skipped (or
post-onboarding) tenant resumes the same assessment at
`/t/{slug}/frameworks/{frameworkKey}/self-assessment` (NIS2 only), which
reuses `<Nis2SelfAssessmentStep>`. The route guards non-NIS2 keys with a
notice. (Discoverability — a card on the NIS2 framework detail page —
is a small follow-up; the route satisfies "a way back".)

## Authorization + rate limiting

Mirrors the existing 6 onboarding routes: usecase-level
`assertCanManageOnboarding` (ADMIN+), not `requirePermission` (there is no
onboarding permission key, and onboarding isn't a privileged root in the
permission-coverage guardrail). `withApiErrorHandling` applies the
mutation-tier rate limit to PUT/POST automatically. The note free-text is
`sanitizePlainText`'d (Epic D) and the answer is emitted as an audit event
(`NIS2_ASSESSMENT_ANSWERED`).

## Files

| File | Role |
|------|------|
| `src/lib/schemas/onboarding.ts` | NIS2 step in ONBOARDING_STEPS + SKIPPABLE_STEPS |
| `src/app-layer/usecases/onboarding.ts` | STEP_ORDER + `isStepApplicable` + skip-aware `getNextStep` + progress fix |
| `src/app-layer/usecases/onboarding-nis2.ts` | get-state / save-answer / complete usecases |
| `src/app-layer/repositories/Nis2GapAssessmentRepository.ts` | `markAssessmentCompleted` |
| `src/app/api/t/[tenantSlug]/onboarding/nis2-assessment/**` | GET / PUT answer / POST complete |
| `src/components/onboarding/Nis2SelfAssessmentStep.tsx` | the dense, autosaving step UI (platform primitives) |
| `src/components/onboarding/OnboardingWizard.tsx` | `visibleSteps` + conditional case + NIS2 complete/skip wiring |
| `src/app/t/[tenantSlug]/(app)/frameworks/[frameworkKey]/self-assessment/**` | resume-later surface |
| `tests/guardrails/nis2-onboarding-step-coverage.test.ts` | structural ratchet |
| `tests/e2e/nis2-self-assessment.spec.ts` | NIS2 + non-NIS2 paths |

## What this is NOT

- **Scoring / results / gap-output** — turning answers into findings +
  tasks + a readiness score (next prompt).
- **Multi-respondent delegation** — `respondent` is shown as a hint chip
  only.
- **Mid-assessment re-sync** of the question set.
- A `questionSetVersion` pin on `Nis2SelfAssessment` — the Prompt-1 model
  has no such column; pinning is deferred with the rest of versioning.

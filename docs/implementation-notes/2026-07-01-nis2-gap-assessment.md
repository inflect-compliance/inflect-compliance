# 2026-07-01 — NIS2 Gap Assessment lifecycle (on the Audits page)

**Commit:** `<pending> feat(nis2): gap-assessment lifecycle on the Audits page`

## Design

The onboarding wizard already runs the NISD2 NIS2 gap-assessment question bank
once when NIS2 is selected — that is the BASELINE. This adds the ongoing
lifecycle the wizard can't: re-assessment, run history/trend, a priority-gap
remediation engine, and propose-not-commit control/risk/task creation — homed on
the Audits page behind a NIS2-gated button.

## Adaptations vs. the original prompt (verify-premise)

The prompt assumed a static TS question bank and a *new* `Nis2GapAssessment`
model with `answersJson`. Discovery showed the repo already has:

- **The bank is DB-backed, single-sourced.** Fixture
  `prisma/fixtures/nis2-gap-assessment.json` (© NISD2 / CC BY 4.0, 15 domains /
  116 questions) → `Nis2GapDomain` / `Nis2GapQuestion` tables →
  `Nis2GapAssessmentRepository`. There is NO static `src/data/gap-assessments/nis2.ts`.
  Creating one would *fork* the source — the opposite of the prompt's #1 rule.
  So the lifecycle **consumes the existing DB bank** (the prompt's Step 0
  "if already shared, just consume it").
- **The run store already exists.** `Nis2SelfAssessment` + normalized
  `Nis2SelfAssessmentAnswer` (unique `[assessmentId, questionId]`). A parallel
  `Nis2GapAssessment` model + `answersJson` blob would duplicate it. Instead we
  added **one column, `source`** (`WIZARD_BASELINE | STANDALONE`, String enum
  matching the model's `status` convention) + a `[tenantId, createdAt]` history
  index.
- **Scoring + priority-gaps + a propose-not-commit path already exist** in
  `nis2-readiness.ts` (`scoreNis2Assessment`, `materializeNis2Gaps`,
  `ReadinessSnapshot` trend). The lifecycle reuses them; the net-new engine
  (`nis2-gap-lifecycle.ts`) adds Risk/Control suggestion + link-not-duplicate on
  top.
- **i18n:** the app has `en.json` + `bg.json` (no `de.json`; the *bank* is
  en/de bilingual). Every sibling Audits-header link and the reference
  `Nis2ReadinessClient` hardcode English, so the new surface does too — adding a
  `de.json` locale or en-only keys would be inconsistent and break bg-parity.

## Baseline vs standalone

`resolveAssessment` stamps the first-ever run `WIZARD_BASELINE` (created during
onboarding). `startStandaloneNis2Assessment` creates a fresh `STANDALONE`
IN_PROGRESS run for a re-assessment; it becomes the latest, so the existing
answer/complete usecases target it. History is the append-only set of runs.

## The Audits conditional home (why NIS2-gated, why not a sidebar item)

`audits/page.tsx` computes `hasNis2` (`tenantHasNis2` — a NIS2 run exists OR the
tenant has NIS2-mapped controls) and passes it to `AuditsClient`, which renders
the "NIS2 Gap Assessment" button ONLY inside that conditional (absent, not
disabled, when NIS2 isn't installed). The lifecycle lives at
`/audits/nis2-gap` — a sub-page of Audits, NOT a sidebar entry: it's a
framework-specific tool, and the sidebar stays lean (same reasoning as Scans
moving onto the Audits page).

## Link-not-duplicate (the load-bearing subtlety)

Gap QUESTIONS are a distinct axis from NIS2 framework REQUIREMENTS — there is no
per-question requirement map. So "link an existing control instead of
duplicating" is implemented as: when the tenant already has NIS2-mapped controls,
a control gap becomes a `CONTROL_LINK` suggestion whose approval creates a
remediation **task bound to the chosen existing control** — reusing it rather
than minting a duplicate control. Only when the tenant has NO NIS2 controls does
the suggestion become `CONTROL_CREATE`.

## Propose-not-commit + management-liability lens

`proposeNis2Remediations` is a PURE read — it ranks gaps and classifies each
(RISK for fine/`PERSONAL_LIABILITY` exposure, TASK for quick wins, CONTROL_LINK /
CONTROL_CREATE otherwise) and NEVER calls a create-usecase. Only
`applyNis2Remediations`, on explicit per-item approval, runs
`risk.createRisk` / `control.createControl` / `task.createTask` (idempotent via a
`NIS2_GAP` category / task marker). The liability lens surfaces `fineExposure`
and `PERSONAL_LIABILITY` prominently in the gap list and review UI.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | `Nis2SelfAssessment.source` + `[tenantId, createdAt]` index |
| `prisma/migrations/20260702090000_nis2_assessment_source/` | add `source` column + index |
| `src/app-layer/usecases/onboarding-nis2.ts` | baseline stamping + `startStandaloneNis2Assessment` |
| `src/app-layer/usecases/nis2-readiness.ts` | `computeNis2Readiness(ctx, assessmentId?)` per-run scoring |
| `src/app-layer/usecases/nis2-gap-lifecycle.ts` | history, `tenantHasNis2`, propose/apply remediation engine |
| `src/app-layer/schemas/gap-assessment.ts` | apply-payload Zod |
| `src/app/api/t/[tenantSlug]/audits/nis2-gap/**` | GET state, POST rerun, GET/POST remediations |
| `src/app/t/[tenantSlug]/(app)/audits/{page,AuditsClient}.tsx` | `hasNis2` gate + button |
| `src/app/t/[tenantSlug]/(app)/audits/nis2-gap/**` | lifecycle surface (server page + client) |
| `src/components/onboarding/{Nis2SelfAssessmentStep,OnboardingWizard}.tsx` | hand-off CTA |
| `tests/guards/nis2-gap-assessment.test.ts` | ratchet |

## Decisions

- Reuse over rebuild — the single bank + existing run store + existing scoring,
  extended minimally, rather than a parallel bank/model (anti-duplication).
- `source` as a String enum (matches `status`), not a Prisma enum — least-churn,
  consistent with the model.
- CONTROL_LINK = remediation task bound to an existing control, because the
  gap↔requirement map doesn't exist.

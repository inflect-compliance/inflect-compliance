# 2026-06-29 — AI-governance self-assessment: onboarding UI + E2E

**Commit:** _(this PR)_ `feat(ai-governance): onboarding UI + E2E for the unified AI-governance self-assessment`

## Context

**PR 2 of 2.** PR 1 (#1336) shipped the backend/data/content core (30 questions,
4 models + RLS, the 3-way coverage readout, usecases, the conditional onboarding
step in `STEP_ORDER`). This PR adds the **UI + API routes + E2E** that consume
it — mirroring the NIS2 self-assessment client.

## What

- **API routes** (`/api/t/<slug>/onboarding/ai-gov-assessment/...`), mirroring
  the NIS2 routes: `GET` state (with an `?architecture=` query gating the
  RAG/agentic questions), `PUT answers/<questionId>` (autosave), `POST complete`,
  `POST materialize` (opt-in gap→Finding). Auth + tenant scoping via
  `getTenantCtx`; permissions asserted in the usecases.
- **`AiGovSelfAssessmentStep`** — the onboarding step component, adapted from
  `Nis2SelfAssessmentStep`: domain Accordion, `RadioGroup` (N/A / No / Partially
  / Yes), `InfoTooltip` showing each question's standard references, per-answer
  autosave, collapsed note field. Platform primitives throughout.
  - **The three coverage cards** (`KPIStat`: AISVS / ISO 42001 / EU AI Act %) at
    the top — the one-assessment-three-readouts payoff, refreshed live on save.
  - An **architecture `ToggleGroup`** (prompt-completion / RAG / agentic / both)
    that gates the conditional questions (auto-N/A otherwise).
  - A **critical-gaps callout** + a "Create findings for gaps" button
    (materialize) + the **OWASP attribution + the not-legal-advice disclaimer**.
- **Wizard wiring** — registered in `OnboardingWizard` (STEPS, `stepApplicable`,
  render switch, complete/skip handlers, suppressed generic Continue button so
  the step drives its own actions). The step advances onboarding on complete.
- **Screening toggle** — a "We build or use AI systems" checkbox added to the
  Company Profile step (`COMPANY_PROFILE.usesAiSystems`). This is the reliable
  trigger for the conditional step (the onboarding framework picker only offers
  ISO 27001 / NIS2, not the AI frameworks), as the spec endorsed.
- **E2E** (`tests/e2e/ai-gov-self-assessment.spec.ts`) — two isolated-tenant
  paths: with the AI flag → the step appears with all three coverage cards + the
  disclaimer + interactive answers; without it → the step is never shown.

## Files

| File | Role |
|---|---|
| `src/app/api/t/[tenantSlug]/onboarding/ai-gov-assessment/**` | GET state / PUT answer / POST complete / POST materialize |
| `src/components/onboarding/AiGovSelfAssessmentStep.tsx` | The onboarding step UI |
| `src/components/onboarding/OnboardingWizard.tsx` | Wizard wiring + the AI-systems screening toggle |
| `tests/e2e/ai-gov-self-assessment.spec.ts` | E2E (AI-on / AI-off paths) |

## Decisions

- **`LoadingSpinner` (Nucleo), not lucide** — the canonical icon family; the
  NIS2 step's lucide `Loader2` is legacy-allowlisted, but a new component uses
  Nucleo (the `no-lucide` ratchet enforces it).
- **Screening toggle over picker change** — adding the AI frameworks to the
  onboarding picker would conflate "install this framework" with "assess my AI";
  the COMPANY_PROFILE flag is the cleaner trigger and matches the server gate.
- **Autosave + live readout** — each save re-fetches state so the three coverage
  cards update immediately; the projection itself is unit-tested (PR 1).

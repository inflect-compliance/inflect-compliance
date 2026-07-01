# 2026-07-01 — DS-2: Digital Sovereignty self-assessment onboarding step (UI)

**Commit:** `<pending>` feat(onboarding): digital sovereignty self-assessment step (UI)

## Design

DS-2 puts the DS-1 backend in front of a user: a conditional onboarding
wizard step that renders the 30-question Digital Sovereignty Posture bank,
scores it live in the browser, and lets the admin approve which surfaced gaps
become real risks + controls.

Consistent with DS-1's architecture, the step is **stateless**. The pure
content bank and the isomorphic scorer are imported directly into the client
component and score in-browser — there is no persisted answer set and no GET
endpoint. The only server round-trip is the DS-1 `materialize` POST, fired on
explicit approval:

```
FRAMEWORK_SELECTION  ──(EU framework?)──►  SOVEREIGNTY_SELF_ASSESSMENT step
                                             │  imports DIGITAL_SOVEREIGNTY_ASSESSMENT + scoring
                                             │  live client score → gap suggestions
                                             ▼
                                   POST …/materialize  (DS-1, approval-gated, idempotent)
```

**Applicability gate.** The step appears only when an EU digital-regulation
framework — `NIS2`, `DORA`, or `EU_AI_ACT` (the keys the framework picker
badges "EU") — is selected. The gate is mirrored in three places, all kept in
sync by the coverage ratchet: the server `isStepApplicable`, the wizard's local
`stepApplicable`, and the two step registries. A non-applicable step is
excluded from the progress denominator, exactly like the NIS2 / AI-governance
conditional steps. Match is case/format-insensitive (legacy lowercase `nis2`,
`EU-AI-ACT` variant).

## Files

| File | Role |
| --- | --- |
| `src/components/onboarding/SovereigntySelfAssessmentStep.tsx` | The step UI — Accordion of 6 dimensions × 5 RadioGroup questions, live posture/band/answered cards, approve-and-create gap panel, materialize POST, skip/complete footer, disclaimer + attribution |
| `src/components/onboarding/OnboardingWizard.tsx` | Wiring — step definition (Landmark icon), local applicability gate, completion/skip handlers, StepContent switch case, generic-Continue suppression |
| `src/app-layer/usecases/onboarding.ts` | `STEP_ORDER` slot + `isStepApplicable` EU-framework gate |
| `src/lib/schemas/onboarding.ts` | `ONBOARDING_STEPS` + `SKIPPABLE_STEPS` registration (the Zod source of truth the step/skip routes validate against) |
| `tests/guardrails/sovereignty-self-assessment-coverage.test.ts` | Extended with the onboarding-step invariants (registration, EU gate, skippability, wizard wiring, primitives + disclaimer) |
| `tests/unit/onboarding.test.ts` | Step-count assertions updated (10 canonical / 8 skippable) |

## Decisions

- **Stateless, no persistence (again).** DS-2 deliberately keeps the DS-1
  contract: the client holds answers, scores locally with the shared pure
  module, and only crosses the boundary to materialise. No `AiGov*`-style
  answer tables. This means no resume-later across sessions yet — a DS-3
  candidate — but zero new schema / RLS / retention surface.
- **EU-framework gate, mirroring AI-gov's shape.** Rather than a new
  COMPANY_PROFILE flag, the gate reuses the framework selection the picker
  already badges "EU". One fewer field to maintain, and it matches the user's
  chosen applicability rule.
- **Hard-coded English labels, not next-intl.** The onboarding wizard and its
  sibling self-assessment steps render literal strings; DS-2 follows that local
  precedent (a `DIMENSION_LABELS` map resolves the bank's i18n `labelKey`s)
  rather than introducing the only i18n-driven step. Full localization is a
  wizard-wide effort, out of scope here.
- **Complete advances the step; it does not auto-materialise.** "Complete
  assessment" only advances onboarding (via `handleCompleteStep`, like the
  AI-gov step). Creating records is a separate, explicit "Create risks +
  controls" action — the propose-not-commit boundary stays visible in the UI.
- **`border-border-subtle` for the suggestions panel.** The border-tone budget
  ratchet only ratchets down; the quiet panel boundary is `subtle` per the
  tone discipline, keeping the budget unchanged.

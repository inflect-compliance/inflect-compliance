# 2026-06-29 — Unified AI-governance self-assessment (AISVS / ISO 42001 / EU AI Act)

**Commit:** _(this PR)_ `feat(ai-governance): unified AISVS/ISO42001/EU-AI-Act 30-question self-assessment in onboarding`

## What

One 30-question onboarding self-assessment that unifies three standards: a
single answer set projects onto **AISVS** (technical), **ISO/IEC 42001** (AI
management system) and the **EU AI Act** (regulation) — "one assessment, three
readouts". It is the getting-started triage; deep per-framework verification is
the framework-install flow.

This is **PR 1 of 2**: the data + content + backend core (models, migration,
RLS, seed, usecases, the 3-way readout, gap→finding, onboarding step, guardrail
+ unit tests — all CI-verifiable). The **UI + E2E** (mirroring the NIS2
self-assessment client) land in PR 2.

## Mirrors the NIS2 self-assessment

Same architecture, different content:
- **Reference content (global, no RLS):** `AiGovDomain` (7) + `AiGovQuestion`
  (30), seeded idempotently from `prisma/fixtures/ai-governance-self-assessment.json`.
- **Tenant-scoped (full RLS):** `AiGovSelfAssessment` (one active run,
  `questionSetVersion` pinned) + `AiGovSelfAssessmentAnswer` (`NA|NO|PARTIALLY|YES`,
  `note` encrypted via Epic B + sanitised via Epic D). Canonical
  `tenant_isolation` + `tenant_isolation_insert` + `superuser_bypass` under
  FORCE RLS; tenantId-leading + FK indexes.
- **Onboarding hook:** `AI_GOVERNANCE_SELF_ASSESSMENT` added to `STEP_ORDER`
  after `FRAMEWORK_SELECTION`, before `ASSET_SETUP`. Applicable when an AI
  framework (AISVS / ISO42001 / EU_AI_ACT) is selected OR
  `COMPANY_PROFILE.usesAiSystems` is set; otherwise auto-skipped and excluded
  from the progress denominator (the NIS2 applicable-step fix applies here too).

## The one-assessment-three-readouts projection (the differentiator)

`src/app-layer/services/ai-gov-coverage.ts::computeAiGovCoverage` — scoring
`YES=1, PARTIALLY=0.5, NO=0, NA=excluded`, weighted by criticality
(`CRITICAL=4 / HIGH=3 / MEDIUM=2`). Each answered (non-N/A) question is projected
onto **every** standard its `mappings` reference, so a single "Yes" credits all
standards it implicates. Output: **AISVS %, ISO 42001 %, EU AI Act %** + a
per-domain breakdown + a flagged list of **CRITICAL gaps** (the EU-AI-Act
legal-exposure questions: aig-1-05 risk-tier, aig-2-04 prohibited practices,
aig-6-01 human oversight).

## Per-source license matrix

| Source | License | Handling |
|---|---|---|
| OWASP AISVS | CC-BY-SA-4.0 | questions are PARAPHRASES referencing chapter IDs; attribution carried |
| ISO/IEC 42001 | copyright | mappings cite **clause numbers only** (ratchet enforces) — never ISO prose |
| EU AI Act | public domain | article references freely used |

## Not legal advice

The EU AI Act risk-tier and FRIA questions are aids; the legal determination is
the tenant's counsel's. The `disclaimer` is carried in the fixture and (PR 2)
rendered wherever questions show.

## Conditional architecture + gap→finding

- Two conditional questions (aig-5-03 RAG, aig-5-04 AGENTIC) auto-resolve to
  **N/A** unless the tenant runs that architecture (`getAiGovAssessmentState({ architecture })`).
- `raiseFindingsFromAiGovGaps` (EXPLICIT, opt-in): HIGH/CRITICAL questions
  answered NO/PARTIALLY materialise a Finding via the existing `createFinding`
  usecase, **idempotent** via a deterministic `[AI_GOV_SELF_ASSESSMENT:<id>]`
  title marker (a question no longer a gap isn't re-raised).

## Files

| File | Role |
|---|---|
| `prisma/fixtures/ai-governance-self-assessment.json` | The 30 questions / 7 domains + mappings |
| `prisma/schema/compliance.prisma` + migration | The 4 models + RLS |
| `prisma/seed.ts` | Idempotent reference seed |
| `src/app-layer/services/ai-gov-coverage.ts` | The 3-way coverage readout |
| `src/app-layer/usecases/ai-gov-self-assessment.ts` | state / save / complete / gap→finding |
| `src/app-layer/usecases/onboarding.ts` | The conditional onboarding step |
| `tests/guardrails/ai-gov-self-assessment-coverage.test.ts` | Structural + license + 3-way readout ratchet |

## Decisions

- **English-only question text** (vs NIS2's bilingual JSON) — the source
  question set is English; simpler `String` columns.
- **Projection, not three assessments** — the value is one answer crediting
  every standard it maps to; computed in a pure service, fully unit-tested.
- **UI/E2E deferred to PR 2** — the backend is independently verifiable; the UI
  mirrors the existing NIS2 self-assessment client.

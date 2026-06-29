# 2026-06-29 — OWASP AISVS AI-vendor security questionnaire

**Commit:** _(this PR)_ `feat(vendor): OWASP AISVS AI-vendor security questionnaire`

## What + why

A tenant procuring a third-party AI tool needs to ask "does this vendor's AI
meet AISVS?" — standard vendor security questionnaires don't cover AI-specific
risk (prompt injection, model supply chain, training-data provenance, output
safety). This adds an **AISVS AI-vendor questionnaire** as TEMPLATE CONTENT on
IC's existing vendor-assessment engine. It is the **buyer assessing a seller's
AI** — distinct from a tenant verifying their own AI (the AISVS self-assessment)
or tracking AISVS as a framework (the AISVS framework import). It rides the
VENDOR machinery, not the framework library.

## Design — content on existing plumbing

- **Template:** a global, published `VendorAssessmentTemplate`
  (`key: AISVS_AI_VENDOR`) seeded from
  `prisma/fixtures/aisvs-vendor-questionnaire.json` — 10 sections, 33 questions.
  `VendorAssessmentTemplate` is RLS-tenant-scoped, so the global baseline is
  seeded per-tenant (the demo tenant here); tenants clone+customise via the
  existing `cloneTemplate` + template-versioning.
- **Sections = externally-assessable AISVS chapters.** A buyer can't directly
  verify a vendor's internal pipeline but CAN ask: C1 (training-data
  provenance), C2 (input validation / prompt-injection), C3 (model lifecycle),
  C5 (access control), C6 (supply chain / AI BOM), C7 (output control), C12
  (monitoring) always apply; **C8 (RAG embeddings)** and **C9 (agentic)** are
  flagged conditional (apply only to those architectures — a screening question
  + N/A handles them). Purely-internal chapters (C4 hardware, C10 MCP, C11
  internal adversarial testing) are omitted — a vendor questionnaire can't
  meaningfully probe them.
- **Questions** are paraphrased from representative AISVS **L1/L2** requirements
  (not an exhaustive 1:1 dump — a usable ~33-question questionnaire), each
  `SINGLE_SELECT` Yes/Partial/No/N/A with per-option points + `riskPointsJson`
  for the existing `vendor-scoring` service. The higher-risk chapters (C2, C6,
  C7) carry heavier section weights.
- **Send → respond → review → score is the EXISTING flow** — no new assessment
  plumbing. This PR provides template content + a readout + risk linkage.

## AISVS-coverage readout

`src/app-layer/services/aisvs-vendor-coverage.ts` — a thin readout (NOT a new
scoring engine; `vendor-scoring.ts` still scores risk). It parses the AISVS
`(C<ch>.<sec>.<req>, L<n>)` reference embedded in each question prompt and the
vendor's answer, and reports **% of assessed AISVS L1 / L2 requirements met**
plus a **per-chapter** breakdown. N/A answers are excluded from the denominator
(a non-applicable chapter doesn't penalise coverage). This is the buyer's
decision artifact.

## Risk linkage (the compliance-graph differentiator)

`src/app-layer/usecases/aisvs-vendor-assessment.ts::raiseFindingFromAisvsCoverage`
— EXPLICIT, opt-in: when L1 coverage is below a threshold it raises a **Finding**
via the existing `createFinding` usecase (not raw prisma), so weak AI-vendor
due-diligence flows into IC's risk register rather than a dead PDF. A standalone
questionnaire tool can't do this; the compliance graph is the differentiator.

## License — CC-BY-SA-4.0

Questions are **paraphrased references** to AISVS requirement IDs (e.g. "Confirm
you screen untrusted inputs for prompt injection (AISVS C2.1.3, L1)") — not
verbatim requirement prose. The template carries the OWASP attribution + license
+ source URL. The ratchet enforces a paraphrase length ceiling.

## Self-reported caveat

Answers are vendor **self-attestations**, not verified by IC — the same caveat
as any vendor questionnaire. Documented on the template description.

## Files

| File | Role |
|---|---|
| `prisma/fixtures/aisvs-vendor-questionnaire.json` | Questionnaire content (sections + questions + AISVS ids/levels) |
| `prisma/seed.ts` | Seeds the global published `VendorAssessmentTemplate` |
| `src/app-layer/services/aisvs-vendor-coverage.ts` | AISVS L1/L2 + per-chapter coverage readout |
| `src/app-layer/usecases/aisvs-vendor-assessment.ts` | Coverage + opt-in finding linkage (via existing `createFinding`) |
| `tests/guardrails/aisvs-vendor-questionnaire-coverage.test.ts` | Structural + license + readout ratchet |

## Decisions

- **AISVS id/level live in the question prompt** (no schema change) — the
  `VendorAssessmentTemplateQuestion` model has no metadata column, and the
  prompt reference doubles as buyer-facing context + the readout's parse key.
- **Per-tenant seed, not cross-tenant global** — RLS forbids reading another
  tenant's template; making one baseline auto-available to all tenants is a
  separate `listTemplates` enhancement, deliberately out of scope.
- **Representative, not exhaustive** — a vendor questionnaire of ~33 questions
  is usable; a 130-question dump of every L1/L2 requirement is not.

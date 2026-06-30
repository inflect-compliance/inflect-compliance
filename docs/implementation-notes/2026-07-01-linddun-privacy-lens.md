# 2026-07-01 — LINDDUN privacy threat lens + OWASP privacy risk templates

**Commit:** `<sha> feat(risk): LINDDUN privacy threat lens + PET treatment hints`

## What + why (honest value)

IC has a rich risk/threat surface (bowtie projection, risk scenarios, risk
hierarchy, FAIR) but **no privacy lens** — risks were generic. This adds a
privacy-threat dimension via **LINDDUN** (the recognized privacy-threat
taxonomy) and seeds a privacy risk-template set (IC previously had ONE privacy
template, "GDPR Non-Compliance").

**This is a LENS, not a new engine** — moderate value, gate-on-demand. It tags
existing risks with privacy-threat categories and offers advisory privacy
mitigations; it does not build a parallel threat-modeling system.

This PR also **folds in P3** (OWASP Top 10 Privacy Risks) — pure content that
fits the same RiskTemplate path and maps onto P1's NIST Privacy Framework.

## Attribution + license

- **LINDDUN** © DistriNet, **KU Leuven** (https://www.linddun.org), freely
  usable with attribution. The 7 categories are encoded NATIVELY + paraphrased
  in `src/lib/privacy/linddun.ts` (the repo is NOT imported).
- **OWASP Top 10 Privacy Risks** © OWASP, **CC-BY-SA** — paraphrased + marked
  `[OWASP Top 10 Privacy Risks]`; never the verbatim OWASP prose.

## What shipped

1. **`src/lib/privacy/linddun.ts`** — the 7 LINDDUN categories (Linking,
   Identifying, Non-repudiation, Detecting, Data Disclosure, Unawareness &
   Unintervenability, Non-compliance) with paraphrased definitions + canonical
   PET treatment HINTS per category (pseudonymization, anonymization,
   differential privacy, data minimization, …). Pure reference data + helpers
   (`petHintsForCodes`, `normalizeLinddunCodes`).
2. **Tagging** — a `linddunCategories Json?` column on **Risk** AND
   **RiskTemplate** (migration `20260701120000_linddun_privacy_lens`). A risk
   carries ≥1 LINDDUN code alongside its ordinary `category`. `createRiskFromTemplate`
   copies the template's classification to the new risk; `updateRisk` lets a
   risk be (re)tagged directly.
3. **Advisory PET hints** — `getRiskPrivacyLens(ctx, riskId)` returns the
   risk's LINDDUN codes + the union of their PET hints under an explicitly
   advisory `petTreatmentHints` key. **Read-only — never auto-applied** as a
   treatment (IC suggests PETs; the tenant decides).
4. **Seed privacy risk templates** — 6 LINDDUN-categorized privacy risks
   (re-identification, excessive linking, unlawful processing, …) + the 10
   OWASP Top 10 Privacy Risks, all `category: 'Privacy'`, each with a LINDDUN
   tag + a `frameworkTag` onto a NIST Privacy Framework subcategory. They ride
   the **existing** `prisma.riskTemplate.upsert` → `createRiskFromTemplate`
   path — no new machinery.
5. **Ratchets** — `linddun-privacy-lens-coverage.test.ts` (7 categories
   attributed; PET advisory-not-auto-applied; risks carry a classification;
   templates seed; **guard against a parallel engine** — no new model / engine
   file) + `owasp-privacy-risks-coverage.test.ts` (10 templates, license guard
   no-verbatim, NIST-PF mapping resolves, existing path).

## Decisions

- **A tag on Risk, not a new model.** LINDDUN is a *classification*, so it's a
  JSON column alongside the existing `category`/FAIR/BIA fields — reusing the
  risk machinery, which the ratchet enforces (no `Linddun*` / `*ThreatModel`
  Prisma model, no `linddun-engine.ts` usecase).
- **PET hints are advisory data, full stop.** They are surfaced read-only; no
  code path turns a hint into a created treatment. IC does not RUN PETs.
- **P3 folded into P2** (per its prompt) — pure content, lowest value, shares
  the path; one PR instead of two.

## Files

| File | Role |
|---|---|
| `src/lib/privacy/linddun.ts` | LINDDUN taxonomy + advisory PET hints (reference data). |
| `prisma/schema/compliance.prisma` | `linddunCategories Json?` on Risk + RiskTemplate. |
| `prisma/migrations/20260701120000_linddun_privacy_lens/migration.sql` | The two columns. |
| `src/app-layer/usecases/risk.ts` | Copy on create-from-template; tag on update; `getRiskPrivacyLens`. |
| `prisma/seed.ts` | `privacyRiskTemplates` (6 LINDDUN + 10 OWASP). |
| `tests/guardrails/linddun-privacy-lens-coverage.test.ts` | P2 ratchet. |
| `tests/guardrails/owasp-privacy-risks-coverage.test.ts` | P3 ratchet. |

# 2026-06-10 — RQ-1 FAIR taxonomy decomposition

**Commit:** `<sha>` feat(risk): FAIR taxonomy decomposition (RQ-1)

The keystone of the risk-quantification roadmap: structured FAIR inputs per risk
so downstream features (Monte Carlo RQ-3, scenarios RQ-4, correlation RQ-8, VaR
reporting RQ-10) have probability distributions to sample, not two opaque dollars.

## Design

- **`fair-calculator.ts`** — pure, stateless math core. Point estimates
  (`computeLEF/PLM/FairALE/TEF/Vulnerability`), distribution-aware sampling
  (`sampleFairALE` over Beta-PERT via a Marsaglia–Tsang gamma sampler + a
  seeded `mulberry32` PRNG for reproducibility), and the backward-compat
  `resolveALE` (FAIR ALE → legacy SLE×ARO → null).
- **Schema** — 19 nullable FAIR columns on `Risk` (TEF/vuln/loss-magnitude/
  secondary + derived `lossEventFrequency`/`fairAle` + `fairInputsJson` +
  metadata) + `FairConfidence` enum + 3 indexes. Additive + zero-downtime;
  legacy risks keep working via `resolveALE`.
- **`updateRiskFair` + `recomputeFairDerived`** — a dedicated usecase (not
  bloating `updateRisk`) that persists inputs then recomputes the stored derived
  columns; derives TEF/Vuln from sub-factors when the direct value is absent and
  CLEARS the derived columns when there's not enough data (no stale ALE).
- **`risk-analytics.ts`** — switched to `resolveALE`, so portfolio totals/top-N
  prefer FAIR ALE transparently.
- **UI** — `FairAnalysisPanel` on a new "Quantification" tab of the risk detail
  page: grouped FAIR inputs with a **live client-side ALE preview** (the pure
  calculator runs in the browser); server recomputes + persists on save.

## Decisions

- **Detail-page panel, not the create-form fragment.** FAIR is a post-creation
  deep-dive needing a risk id to save against; `RiskEvaluationFields` stays the
  quick likelihood/impact create form. (Deviation from the roadmap's ASCII,
  which showed it inline — the panel is the maintainable home.)
- **Beta-PERT sampling now** (not triangular) so RQ-3's Monte Carlo inherits a
  correct sampler; bounded iteration keeps it deterministic + non-hanging.
- **Vulnerability ≈ `tc/(tc+cs)`** — a monotonic, bounded point approximation;
  RQ-3 will replace it with a distributional capability-vs-strength comparison.

## Files

| File | Role |
| --- | --- |
| `usecases/fair-calculator.ts` | FAIR math core + PERT sampling + resolveALE. |
| `usecases/risk.ts` | `updateRiskFair` + `recomputeFairDerived`. |
| `usecases/risk-analytics.ts` | resolveALE in portfolio analytics. |
| `api/t/[slug]/risks/[id]/fair/route.ts` | FAIR input PUT. |
| `risks/[riskId]/FairAnalysisPanel.tsx` + `page.tsx` | Quantification tab UI. |
| `prisma/schema/{compliance,enums}.prisma` + migration | Columns + enum. |

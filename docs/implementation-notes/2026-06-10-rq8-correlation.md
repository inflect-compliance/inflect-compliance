# 2026-06-10 — RQ-8 Risk correlation & portfolio modelling

**Commit:** `<sha>` feat(risk): risk correlation & portfolio modelling (RQ-8)

Pairwise correlations so the Monte Carlo (RQ-3) produces actuarial-grade tails:
positively-correlated risks co-materialise, widening VaR. Independent sampling
underestimates tail risk.

## Design

- **Linear algebra (pure, in `monte-carlo.ts`)** — `choleskyDecompose` (Σ → L,
  throws if not positive-definite), `generateCorrelatedUniforms` (independent
  normals → X = L·Z → uniforms via Φ). `simulatePortfolio` gains a
  `correlationMatrix` option: when present + Cholesky-decomposable, each
  iteration draws correlated uniforms and samples every risk's ALE via the
  single-uniform PERT path (falls back to independent sampling if Cholesky
  fails).
- **`risk-correlation.ts`** — `validatePSD` (pure, Jacobi eigenvalues →
  minEigenvalue) + `computeSuggestions` (pure: shared assets `0.3+0.1·n`, shared
  controls `0.2+0.1·n`, cap 0.8). CRUD normalises pairs (riskAId < riskBId);
  `getCorrelationMatrix` builds the NxN (diagonal 1, missing 0) + PSD flag;
  `suggestCorrelations` loads asset/control links and calls the pure core.
- **Schema** — `RiskCorrelation` (unordered pair, coefficient, rationale,
  source) + RLS + migration.
- **Routes** — `risks/correlations` (GET matrix, PUT set, DELETE) +
  `correlations/suggest`. **UI** — cross-tab matrix editor: heat-banded cells
  (semantic tokens), click-to-edit a pair, PSD badge, auto-suggest + apply.

## Decisions

- **Single-uniform PERT path under correlation** — the standard Cholesky→Φ→
  inverse-CDF technique needs one uniform per risk; FAIR multi-factor sampling is
  bypassed when a correlation matrix is supplied (documented; the correlation
  feature is portfolio-tail-focused). Verified by an integration test asserting
  correlated stdDev > independent stdDev.
- **PSD via Jacobi eigenvalues** (not Cholesky-only) so the UI can report
  minEigenvalue + flag a contradictory matrix before simulation.

## Files

| File | Role |
| --- | --- |
| `usecases/monte-carlo.ts` | Cholesky + correlated uniforms + sim option. |
| `usecases/risk-correlation.ts` | PSD + CRUD + matrix + suggestions. |
| `prisma/schema/compliance.prisma` + migration | RiskCorrelation + RLS. |
| `api/t/[slug]/risks/correlations/**` | matrix + suggest routes. |
| `risks/correlations/page.tsx` | matrix editor. |

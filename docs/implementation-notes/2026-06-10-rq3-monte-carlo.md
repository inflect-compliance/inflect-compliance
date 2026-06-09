# 2026-06-10 — RQ-3 Monte Carlo simulation engine

**Commit:** `<sha>` feat(risk): Monte Carlo simulation engine (RQ-3)

Replaces the rank-based loss-exceedance curve with a proper stochastic
simulation — portfolio loss distribution, percentiles / VaR, and per-risk
contribution — sampling each risk's FAIR PERT distributions (RQ-1).

## Design

- **`monte-carlo.ts`** — `simulatePortfolio(risks, config)` is **pure** (seeded,
  no DB): N iterations × per-risk ALE sample (FAIR risks via RQ-1's
  `sampleFairALE`; point-only risks via `samplePert(pointToPert(ale))`), summed
  to a portfolio loss; then percentiles (p50/p90/p95/p99), mean/σ/min/max, a
  20-point loss-exceedance curve, per-risk mean/p95/contribution, and a
  convergence delta (last-1000 vs all). `createPRNG` = RQ-1's mulberry32;
  `samplePert(dist, u)` is a triangular inverse-CDF (u=0→min, u=1→max).
- **Schema** — `RiskSimulationRun` (immutable run record: config + percentile
  results + perRisk/LEC JSON + provenance) + RLS + migration.
- **`runSimulation`** loads quantified risks → `simulatePortfolio` → persists a
  COMPLETED run. `getLatestSimulation` feeds the dashboard.
- **Route** — `risks/simulate` (GET latest, POST run). **UI** —
  `MonteCarloPanel` on the risk dashboard: VaR cards + MC loss-exceedance curve
  + top contributors + a Run button.

## Decisions

- **Reuse RQ-1's Beta-PERT `sampleFairALE`** for FAIR risks (tested sampler);
  `samplePert` (triangular) is the single-uniform helper for point risks + the
  RQ-8 correlated-sampling path.
- **Synchronous** for now (the roadmap's >50-risk background-job split is a
  follow-up; the engine + `RiskSimulationRun.status` machinery are ready for it).
- Per-risk raw sample arrays kept only for ≤200-risk portfolios (memory bound);
  larger portfolios get mean-only per-risk stats.

## Files

| File | Role |
| --- | --- |
| `usecases/monte-carlo.ts` | pure simulation core + PRNG + PERT + run/latest. |
| `prisma/schema/compliance.prisma` + migration | RiskSimulationRun + RLS. |
| `api/t/[slug]/risks/simulate/route.ts` | run + latest. |
| `risks/dashboard/MonteCarloPanel.tsx` + `page.tsx` | dashboard panel. |

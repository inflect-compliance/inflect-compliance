# 2026-06-12 — RQ3-1: one LEC — the simulated curve takes the stage

**Commit:** _(see PR — `feat(rq3-1): the simulated LEC takes the stage; per-risk tail percentiles cached`)_

## Design

Two loss exceedance curves existed. The dashboard headlined a
rank-based bootstrap whose own docstring admitted "This is NOT a
Monte-Carlo convolution" — it answers "what share of RISKS sit above
this loss" (coverage), not "what is the probability the YEAR'S losses
exceed X" (the LEC question). The honest simulated curve (RQ-3
engine: seeded, VaR, convergence) hid inside MonteCarloPanel further
down the page. RQ3-1 swaps the casting:

**The simulated curve headlines.** `MonteCarloPanel` moves to the
stage slot directly after the quantitative-analytics card and gains
the full threshold vocabulary: P50/P80/P95 percentile markers (muted
reference lines from the run's persisted VaR columns) and the
appetite carry-over. The rank sketch is gone from the dashboard;
its old column now answers the coverage question honestly as an
"Exposure by category" list.

**The appetite polarity inverts — deliberately.** On the rank sketch
the x-axis was per-risk ALE, so the per-risk cap was the honest line
and the portfolio ceiling would lie. On the simulated curve the
x-axis is the year's TOTAL loss, so the polarity flips: the portfolio
ceiling (`totalAleThreshold`) is the genuine x-threshold — the
curve's height at that line IS the probability of breaching appetite
this year (rendered as "≈N% chance the year's losses exceed the
ceiling", `lec-portfolio-appetite-note`) — and the per-risk cap
(`singleRiskAleMax`) would lie as a line. It gets a per-risk note
instead: "K of N simulated risks carry a P90 loss above the cap"
(`mc-per-risk-appetite-note`), computed from the new cached
percentiles. The RQ2-6 guard was rewritten to pin the new polarity
with the rationale in its docstring.

**The rank bootstrap is demoted, not deleted.** The usecase still
emits it — renamed `lecPoints` → `coverageSketch`
(`CoverageSketchPoint`), with a docstring disclaimer explaining
exactly why it is not an LEC. The API payload shape changed
accordingly (internal dashboard consumer only).

**Per-risk tail percentiles are the new data spine.** The engine's
per-risk emission grows from `{aleMean, aleP95}` to the full trio
`{aleP50, aleP90, aleP95}` (sampled when the portfolio is ≤ 200
risks; mean-fallback above). `portfolioP80` joins the persisted VaR
columns (migration `20260612000000_rq3_1_simulation_p80`).
`getPerRiskPercentiles(ctx)` retrieves the latest run's cache as
`Record<riskId, RiskTailPercentiles>`, degrading pre-RQ3-1 runs
(missing trio keys) to the mean — RQ3-3 (portfolio percentiles),
RQ3-4 (tail language), and RQ3-10 (board page) build on this.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/monte-carlo.ts` | p80 + per-risk trio in engine; persisted; `getPerRiskPercentiles` |
| `prisma/schema/compliance.prisma` + migration | `RiskSimulationRun.portfolioP80` |
| `src/app-layer/usecases/risk-analytics.ts` | `lecPoints` → `coverageSketch` demotion + disclaimer |
| `src/app/t/[tenantSlug]/(app)/risks/dashboard/MonteCarloPanel.tsx` | the stage: percentile markers, appetite lines/notes, breach probability |
| `src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx` | rank curve deleted; category list replaces it; panel moved + fed appetite |
| `src/components/ui/charts/index.ts` | re-export `LossReferenceLine` |
| `tests/guards/rq3-1-simulated-lec.test.ts` | the new ratchet |
| `tests/guards/rq2-6-appetite-lec.test.ts` | rewritten for the inverted polarity |
| `tests/guardrails/b10-advanced-analytics.test.ts` | updated to the demoted shape |

## Decisions

- **Demote, don't delete, the rank emission.** The per-risk
  (ALE, rank-fraction) ladder is genuinely useful data — it just
  isn't a probability curve. Keeping it under an honest name with a
  module-level disclaimer costs nothing and preserves the API for a
  future coverage table.
- **Markers over a band.** The "percentile band" the issue sketches
  is rendered as three vertical markers (P50/P80/P95) on the single
  simulated curve rather than a multi-curve band — the curve itself
  already encodes the full distribution; epistemic resampling bands
  would imply uncertainty information the engine doesn't compute.
- **Breach probability is read off the persisted curve** (step
  semantics, first point ≥ ceiling) rather than re-simulated — zero
  extra compute, consistent with what the user sees drawn.
- **Ratchet shape** (`rq3-1-simulated-lec.test.ts`): bans
  `lecPoints`/`coverageSketch`/`<LossExceedanceCurve` from the
  dashboard page; pins the demotion disclaimer + the honest field
  name; pins the engine trio + p80 column/migration pairing + the
  graceful-degrade lines in `getPerRiskPercentiles`; pins the
  marker labels and both appetite notes in the panel.

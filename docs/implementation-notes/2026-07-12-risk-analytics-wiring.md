# 2026-07-12 — Wire the risk-analytics tools to real Risk records

**Commit:** _(P2 of the risk-domain roadmap)_

## Design

Four "risk analytics" pages were backend-capable but their create forms
omitted the field that links a record to a Risk, so they rendered
convincing shells over data islands. Plus the scenario simulation could
corrupt the executive dashboard.

- **Scenarios — scope isolation (was actively harmful).** `getLatestSimulation`
  returned the newest COMPLETED run of ANY trigger. A scenario run is
  COMPLETED + newer, so it became "the latest simulation" and — because
  scenario runs historically omitted `portfolioP80` — blanked the Dashboard
  MonteCarloPanel and the Board P80 headline. Now scoped to baseline runs
  (`triggeredBy != 'scenario'`); scenario runs also persist `portfolioP80`
  as belt-and-braces. Running a what-if can no longer alter the dashboard.
- **Scenarios — per-risk overrides.** The create form now has an override
  builder (pick a risk → a FAIR field → a new value), so the what-if has
  something to model and comparisons are non-zero. The engine + route
  schema already accepted `overrides` — this was the missing UI.
- **KRI — risk picker + direction.** The form now sets `riskId` and
  `direction` (HIGHER/LOWER_IS_WORSE), unlocking the breach → re-assess loop.
- **Loss-events — risk picker.** The form now attributes each loss to a
  Risk so `byRisk` aggregation is real (null = portfolio-attributed).
- **Hierarchy — parentId + risk links.** Add-node sends `parentId` (trees
  can be built) and a new control attaches risks to nodes via the existing
  `/hierarchy/[nodeId]/links` API (roll-up is non-empty).

All four share one new `RiskPicker` (over a light `/risks/options`
`{ id, title }` endpoint) so none hand-roll the fetch.

## Decisions

- **Loss actuals stay a SCOREBOARD — no ALE write-back.** Recorded actuals
  are deliberately NOT fed back to calibrate the FAIR ALE. Predictions live
  with the simulation; conflating measured actuals into the forward model
  would need careful statistical design (credibility weighting, exposure
  normalisation) and would silently move risk scores. The page overlays the
  simulator's Mean/P90 as honest references only. Revisit as a deliberate
  calibration feature, not a side effect of recording a loss.
- **Backends were already capable.** KRI/loss-event/hierarchy routes +
  usecases + models already accepted the linking fields; scenario overrides
  too. P2 is almost entirely frontend wiring + one backend scope fix
  (`getLatestSimulation`) + persisting `portfolioP80` on scenario runs.

## Files

| File | Role |
|---|---|
| `src/app-layer/usecases/monte-carlo.ts` | `getLatestSimulation` scoped to baseline runs |
| `src/app-layer/usecases/risk-scenario.ts` | scenario run persists `portfolioP80` |
| `src/app-layer/usecases/risk-picker.ts` | NEW — `listRiskOptions` `{id,title}` |
| `src/app/api/t/[tenantSlug]/risks/options/route.ts` | NEW — picker endpoint |
| `.../risks/_shared/RiskPicker.tsx` | NEW — shared risk combobox |
| `.../risks/{scenarios,kri,loss-events,hierarchy}/page.tsx` | create forms wired to real risks |
| `tests/integration/scenario-simulation.test.ts` | +scope-isolation behavioural test |
| `tests/guards/p2-risk-analytics-wiring.test.ts` | structural ratchet |

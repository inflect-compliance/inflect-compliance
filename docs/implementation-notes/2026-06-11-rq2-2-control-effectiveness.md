# 2026-06-11 — RQ2-2 control effectiveness → derived residual

**Commit:** `<sha>` feat(risk): control-derived residual suggestion (RQ2-2)

Second PR of the RQ2 roadmap. Controls finally participate in the
risk math — and the divisor-era residual formula (MITIGATE → score/5,
TRANSFER → score/10) is dead.

## Design

- **`src/lib/risk-residual.ts`** — pure math. Layered combination
  `1 − ∏(1 − eᵢ)` routed by `Control.mitigationType` (the same split
  RQ-7's bow-tie uses): PREVENTIVE/DETERRENT reduce likelihood;
  DETECTIVE/CORRECTIVE/COMPENSATING reduce impact. Reductions cap at
  `MAX_REDUCTION = 0.8`; suggestions `ceil` + clamp ≥ 1 (the risk
  still exists); the rollup derives via `calculateRiskScore` — one
  scoring seam. Controls without an effectiveness signal or a
  mitigation type are EXCLUDED but visibly listed with a reason
  (data-quality nudge, not silent omission).
- **Effectiveness resolution** (usecase loader): MEASURED test
  pass-rate over the rolling 90-day window (one `groupBy` across all
  linked controls — no N+1) beats the static DECLARED
  `Control.effectiveness` field. Each contribution carries its
  source so the explainer can say "measured 92% (last 90d)" vs
  "declared 70%".
- **Propose, don't overwrite.** `getResidualSuggestion` is read-only
  and recomputed per call (link/unlink + fresh test runs reflect
  immediately). `acceptResidualSuggestion` recomputes SERVER-SIDE —
  the POST body carries only an optional justification, never
  numbers — persists the decomposed residual, and appends a
  `DERIVED`-source RiskScoreEvent (RQ2-1).
- **`completePlan` rewired** — `residualForCompletedStrategy`:
  AVOID → semantic zero (0/0, score 0); MITIGATE → control-derived
  when ≥1 signal exists, otherwise **no residual is fabricated**;
  TRANSFER → no auto-write (controls don't model contractual
  transfer); ACCEPT → no write (accepting inherent). PLAN-source
  ledger events carry the derivation narrative.
- **FAIR bridge — reference, not assertion.** The payload exposes
  `combined` so the Quantification UI can show "your linked controls
  suggest ~X% combined effectiveness" beside the FAIR
  `controlStrength` input. Deliberately NOT auto-written: FAIR's
  controlStrength is relative to threatCapability
  (`vuln = tc/(tc+cs)`); deriving it from an absolute percentage
  would be pseudo-rigor.

## Files

| File | Role |
| --- | --- |
| `src/lib/risk-residual.ts` | Pure combination/suggestion/description math |
| `src/app-layer/usecases/risk-residual-suggestion.ts` | Loader (MEASURED>DECLARED), get + accept |
| `src/app-layer/usecases/risk-treatment-plan.ts` | Divisors deleted; derivation-based completePlan |
| `src/app/api/.../risks/[id]/residual-suggestion/route.ts` | GET suggestion / POST accept (justification-only body) |
| `tests/unit/risk-residual.test.ts` | Formula suite (layering, routing, cap, clamps) |
| `tests/unit/risk-residual-suggestion.test.ts` | Loader + accept + guards |
| `tests/unit/usecases/risk-treatment-plan.test.ts` | Rewritten strategy matrix (divisor expectations removed) |
| `tests/guardrails/risk-score-provenance.test.ts` | + RQ2-2 block: divisors stay dead, DERIVED provenance, no client numbers, capped layering |

## Decisions

- **No fabricated residuals.** The old formula wrote *something* on
  every completion. Now MITIGATE-without-signals and TRANSFER write
  nothing — an absent number is more honest than an arbitrary one,
  and the assessment flow (RQ2-4) is the right place for a human to
  assert it.
- **AVOID keeps its zero** — that's semantics (the activity is
  gone), not an arbitrary constant.
- **Existing divisor-era residualScores untouched** — they keep
  their values; RQ2-1's backfill already marked their provenance
  MIGRATION, so the explainer can label them honestly.
- **Suggestion card UI deferred to RQ2-4** — the Assessment tab owns
  that surface; shipping a throwaway card here would churn the
  detail page twice. The API contract this PR ships is what RQ2-4
  renders.

## Ratchet additions

Divisor identifier + `Math.floor(x/5|10)` shapes banned from the
plan usecase; accept route schema may never grow score-shaped
fields; `MAX_REDUCTION` + layered-survival shape pinned; rollup must
flow through `calculateRiskScore`.

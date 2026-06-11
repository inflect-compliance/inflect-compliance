# 2026-06-11 — RQ2-3: the score that explains itself

**Commit:** _(this commit)_ — RQ2-3 ScoreExplainer popover + aggregated explanation endpoint

## Design

A risk score is the single most-stared-at number in the product, and
until now it was mute: a user seeing "20" on the risks list had to
open the risk, cross-reference the matrix config, check the controls
tab, and dig the audit trail to answer "why 20, says who, since
when?". RQ2-1 gave us the provenance ledger and RQ2-2 the control
derivation — RQ2-3 surfaces both at the chip itself.

One read-only aggregator (`getScoreExplanation`) returns everything a
popover needs in a single round trip:

```
inherent  — dims + score + the TENANT'S OWN level labels
            (matrix config) + band via the canonical resolver
residual  — dims + score + band, with `legacyUndecomposed: true`
            for divisor-era rows (residualLikelihood IS NULL)
controls  — RQ2-2 combination summary + the residual the current
            control stack would justify
quant     — `resolveALE` line in compact currency (€1.3M), null
            when the risk isn't quantified
breaches  — open (resolvedAt IS NULL) appetite breaches, bounded
events    — 5 most recent RiskScoreEvents with batched actor names;
            MIGRATION rows labelled "pre-provenance backfill"
```

Every section degrades to null independently, so a tenant with no
matrix labels, no FAIR inputs, and no appetite config still gets a
useful formula + provenance popover.

The client component (`RiskScoreExplainer`) wraps any chip and
lazy-fetches on first open — list pages render hundreds of chips, so
eager fetching would be a self-inflicted N+1 against our own API.
Wired on the two canonical surfaces: the risks-list score cell and
the risk-detail MetaStrip inherent score.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/risk-score-explanation.ts` | Aggregator usecase + `formatCompactCurrency` |
| `src/app/api/t/[tenantSlug]/risks/[id]/score-explanation/route.ts` | GET-only endpoint |
| `src/components/RiskScoreExplainer.tsx` | Lazy-fetch popover, one component for every surface |
| `src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx` | List score cell wrapped |
| `src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx` | Detail MetaStrip inherent score wrapped |
| `tests/unit/risk-score-explanation.test.ts` | Aggregator behaviour |
| `tests/guardrails/risk-score-explainer.test.ts` | Presence + lazy-fetch + read-bound ratchet |

## Decisions

- **One aggregated endpoint, not five client fetches.** The popover
  opens on hover-intent; latency budget is one round trip. The
  usecase parallelises events/breaches/suggestion with
  `Promise.all` and batches actor names — bounded at 5 events,
  10 breaches.
- **Tenant language first.** "Likely × Severe" reads like the
  tenant's own risk methodology; the numeric formula rides along as
  a subordinate clause. Falls back to numerics when `levelLabels`
  is null.
- **`legacyUndecomposed` instead of fabricated dims.** Divisor-era
  residuals have a score but no likelihood/impact decomposition.
  The popover says so honestly ("dimensions unknown — legacy
  formula") rather than inventing dims, which would poison RQ2-9's
  movement view.
- **GET-only by ratchet.** An explanation endpoint must never grow
  a mutation verb; the guardrail bans `export const POST|PUT|…`.
- **Suggested-vs-actual nudge.** When the control stack justifies a
  different residual than the stored one, the popover shows the
  delta — the gentle pull toward RQ2-2's accept flow without
  auto-overwriting anything.

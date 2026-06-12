# 2026-06-12 — RQ3-4: tail-aware language — expected vs bad year, everywhere

**Commit:** _(see PR — `feat(rq3-4): tail-aware language — expected vs bad year on every per-risk ALE surface`)_

## Design

Every chip, explainer line, and PDF row said "€120K/yr" — a mean.
The P90 existed in the simulator (RQ3-1's per-risk percentile cache)
and appeared nowhere a human reads. RQ3-4 introduces the second
register through ONE pure formatter and wires every named per-risk
ALE surface through it.

**The formatter** (`src/lib/tail-language.ts::formatTailAwareAle`):
- with tail data: `expected €120K · bad year €1.4M (P90)` (full) /
  `€120K · bad yr €1.4M` (compact, for chips);
- without: `€120K/yr (mean — run a simulation for tails)` (full) /
  bare mean (compact — a chip cannot carry the lecture, the full
  surfaces do);
- a P90 at or below the mean is NOT tail data (pre-RQ3-1 runs
  degrade percentiles to the mean) — the mean register renders;
- callers supply the money function (the OB-A `useMoneyFormatter`
  hook client-side, a `formatCompactCurrency(v, sym)` binding
  server-side) so the tenant-currency single voice composes.

**The data path.** New `GET /risks/tail-percentiles` serves the
RQ3-1 cache (`getPerRiskPercentiles`) keyed by riskId. The risk
register and detail pages fetch it failure-soft; the dashboard
derives the same map from the simulation run it already holds
(RQ3-3 lifted state); the report assembler reads
`latestSim.perRiskResultsJson` it already loads; the score explainer
calls `getPerRiskPercentiles` server-side.

**Surfaces wired:** risk register chip, detail meta-strip ALE chip,
score-explainer quant line, dashboard top-10 rows, coherence rows,
PDF top-risks table, PPTX board-deck rows. CSV gets a raw
`Bad year (P90)` data column instead of a formatted string (CSV is
data, not prose) — empty when no tail exists, never a duplicated
mean. Aggregate surfaces (hierarchy roll-ups, category sums, matrix
cell totals) are deliberately excluded: P90s do not sum, so tail
language on a Σ would lie.

## Files

| File | Role |
| --- | --- |
| `src/lib/tail-language.ts` | the one formatter |
| `src/app/api/t/[tenantSlug]/risks/tail-percentiles/route.ts` | cache endpoint |
| `src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx` | register chip |
| `src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx` | meta-strip chip |
| `src/app-layer/usecases/risk-score-explanation.ts` | quant line |
| `src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx` | top-10 + coherence rows |
| `src/app-layer/reports/risk-report-render.ts` + `risk-report.ts` | PDF/PPTX rows + CSV column + aleP90 threading |
| `tests/guards/rq3-4-tail-language.test.ts` | the ratchet |

## Decisions

- **One formatter, money injected.** Passing the formatter function
  (not a symbol) keeps the OB-A one-voice invariant AND lets client
  and server callers compose without duplicating currency logic.
- **Compact register drops the mean suffix.** The honest "(mean —
  run a simulation for tails)" lecture belongs on full surfaces
  (explainer, PDF); chips degrade to the bare mean silently — the
  full surfaces carry the gap.
- **CSV is data.** A combined display string in a CSV cell would
  poison downstream spreadsheets; the raw P90 column preserves
  machine-readability while PDF/PPTX (display documents) use the
  formatter.
- **Ratchet shape** (`rq3-4-tail-language.test.ts`): pins both
  register strings + the honest suffix + the `aleP90 > aleMean`
  guard in the lib; pins each surface's formatter call site (and
  bans the old bare `formatCompactCurrency(ale)` in the register
  chip); pins the endpoint wiring and the CSV empty-cell rule.

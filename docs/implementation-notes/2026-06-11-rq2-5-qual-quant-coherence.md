# 2026-06-11 — RQ2-5: qual ↔ quant coherence bridge

**Commit:** _(this commit)_ — coherence detector + side-by-side display + matrix ALE heat overlay

## Design

The product spoke two disconnected risk languages: qualitative
(L×I score, matrix bands) and quantitative (FAIR / SLE×ARO ALE). A
risk could sit at qual score 4/25 with a €2M ALE and nothing
noticed. Three connected remediations:

**1. Side-by-side display.** Quantified rows on the risks list show
a compact € ALE beside the score chip; the detail header MetaStrip
gains an `ALE` item. One glance now shows both languages.

**2. Incoherence detection** (`src/lib/risk-coherence.ts`, pure).
`detectIncoherence` ranks the QUANTIFIED subset by qual score and
by ALE (mid-rank percentiles — ties can't self-flag) and flags
quartile disagreement: top-quartile ALE + bottom-quartile score →
`QUANT_HIGH_QUAL_LOW`, and the inverse. Rank-based deliberately —
absolute € thresholds would make the detector currency-scale-
dependent. Below `MIN_QUANTIFIED_FOR_COHERENCE = 4` the detector
returns silence (quartiles need members). Surfaced as a dashboard
widget (`GET /risks/coherence`, read-only, failure-soft) listing
the disagreeing risks with plain-language direction lines.

**3. ALE heat overlay on the matrix.** `RiskMatrixDataCell` gains
`totalAle`; the engine shows a "€ ALE heat" toggle ONLY when at
least one cell carries monetary data. Toggled on, each cell's
paint opacity tracks its ALE share of the heaviest cell
(0.2 → 0.92) and the compact € value renders under the count —
the heatmap reads monetary concentration, not just counts.
Counts, click-through, tooltips, and the gridcell a11y tree are
unchanged; the aria-label gains the ALE sentence.

## Files

| File | Role |
| --- | --- |
| `src/lib/risk-coherence.ts` | Pure detector + canonical `formatCompactCurrency` |
| `src/app-layer/usecases/risk-analytics.ts` | `getRiskCoherence` thin loader |
| `src/app/api/t/[tenantSlug]/risks/coherence/route.ts` | GET-only report endpoint |
| `src/components/ui/RiskMatrix.tsx` / `RiskMatrixCell.tsx` | ALE overlay toggle + intensity paint |
| `…/risks/RisksClient.tsx` | List ALE chip + matrix cell ALE sums |
| `…/risks/[riskId]/page.tsx` | Detail header ALE item |
| `…/risks/dashboard/page.tsx` | Coherence widget |
| `src/app-layer/repositories/RiskRepository.ts` | List select ships the three quant inputs |

## Decisions

- **Ranks, not thresholds.** €50K is a top risk for a bakery and
  noise for a bank; rank disagreement is meaningful at any scale.
- **Quantified subset only.** Comparing a quantified risk's ALE
  rank against unquantified risks' scores would manufacture
  contradictions out of missing data.
- **`formatCompactCurrency` moved to the pure lib** (client surfaces
  can't import the explanation usecase without dragging server
  modules); the RQ2-3 usecase re-exports it so existing imports and
  the unit suite stay stable.
- **Zero-cost guarantee on the overlay**: no ALE data → no toggle,
  no attribute change, no per-cell branching. Locked by the rendered
  suite + the `rq2-5-coherence` ratchet.
- **Widget gate**: the dashboard card renders only at
  `quantifiedCount >= minRequired`, and an agreeing portfolio gets a
  one-line all-clear rather than an empty box — coherence is a
  positive signal worth stating.

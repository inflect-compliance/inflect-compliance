# 2026-06-11 — RQ2-9: matrix movement view (inherent → residual)

**Commit:** _(this commit)_ — movement overlay on the risk matrix

## Design

The heatmap answered "where do risks sit?" but never "what did our
treatment buy?". The movement view draws each risk's inherent →
residual displacement on the matrix: an origin ring at the inherent
cell, a line, a filled dot at the residual cell. Identical paths
dedupe into one arrow with a `×N` count (ten risks taking the same
path is one fat arrow, not ten overdrawn ones); same-cell pairs
(no movement) are skipped.

Only risks with a DECOMPOSED residual (RQ2-1's
`residualLikelihood`/`residualImpact`) qualify — a legacy
undecomposed score has no destination cell, and inventing one
would draw a lie. The list select ships the two dims; the
`matrixMovements` memo in `RisksClient` filters and maps.

The overlay is an absolutely-positioned SVG over the data-cell
area only (header column + footer row excluded), so percentage
coordinates in NxN space map 1:1 onto cell centres — and the same
`swapAxes` resolution the cells use keeps arrows correct after an
axis flip. `pointer-events-none` preserves cell drill-through;
direction reads via the ring → dot pair instead of an
aspect-distorted arrowhead marker. Zero-cost contract matches the
RQ2-5 ALE overlay: no movement data → no toggle, no overlay node,
no attribute change.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/RiskMatrix.tsx` | `movements` prop, toggle, dedupe, SVG overlay |
| `…/risks/RisksClient.tsx` | `matrixMovements` memo (decomposed-only filter) |
| `src/app-layer/repositories/RiskRepository.ts` | List select ships residual dims |
| `tests/rendered/risk-matrix-movement.test.tsx` | Zero-cost, dedupe, geometry, a11y |
| `tests/guards/rq2-9-matrix-movement.test.ts` | Select + filter + gate ratchet |

## Decisions

- **Ring → dot, not arrowheads.** The overlay uses
  `preserveAspectRatio="none"`, which distorts marker geometry;
  origin-ring/destination-dot reads direction at any aspect.
- **Dedupe by path, weight by count.** Stroke width steps up for
  multi-risk paths; the `×N` label carries the exact figure.
- **Decorative SVG + aria summary.** The per-risk story lives in
  the assessment tab; the overlay announces only the moved-risk
  total ("3 risks moved from inherent to residual position").

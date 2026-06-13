# 2026-06-13 — RQ3-OB-D — Closed loops (arrow identity, accept feedback, adaptive bridge)

**Commit:** `pending` (branch `claude/rq3-ob-d-closed-loops`)

## Design

Three loops RQ2 opened but left dangling — each closed with data that was
already in hand.

### 1. Arrows name their risks

The risk-matrix movement overlay (RQ2-9) deduplicates identical
inherent→residual paths into one fat arrow with a `×N` count. The dedup
collapsed identity: hover said "three risks moved" but not _which_ three.

The `movementArrows` memo now retains `titles: string[]` per path (the
`RiskMovement` objects already carried `title`). Each arrow renders a native
SVG `<title>` composed by a new pure helper `movementArrowTitle(titles)`:
top 8 titles joined, then a `+N more` overflow tail so a path shared by 40
risks stays readable. The overlay is `pointer-events: none` (decorative,
never blocks cell clicks); each arrow `<g>` opts back in with
`pointerEvents: 'auto'` + a transparent wide hit-line so the native tooltip
actually fires on hover.

### 2. Accepting deserves an answer

"Accept suggestion" silently refetched — the user committed a residual and
got no confirmation. The accept flow now fires a success toast. The
acceptance criterion is load-bearing: **toast content derives from the
server response, not client state.** `acceptResidualSuggestion` recomputes
the residual server-side and now composes a one-liner from those recomputed
values via a new pure helper `describeAcceptedResidual(suggestion,
participatingCount)` → `"Residual 8 — 2 controls, 60% likelihood / 30%
impact"`. The usecase returns `{ ...suggestion, summary }` (spread keeps
existing `.residualScore` consumers working); the route surfaces it under
`accepted.summary`; the panel reads `body.accepted.summary` and toasts it.
Client draft state never composes the message.

### 3. The bridge knows where you've been

The "Quantify this risk →" bridge reads wrong once a FAIR ALE exists — the
work is done. `AssessmentRisk` gains `fairAle?: number | null` (plumbed from
the detail page's risk object); the bridge copy + helper text branch on it:

| `fairAle` | Button | Helper text |
| --- | --- | --- |
| null | "Quantify this risk" | "Need loss numbers instead of bands? …" |
| set | "Review the FAIR analysis" | "This risk already carries a FAIR loss estimate. …" |

Same `onQuantify` callback — only the framing changes.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/RiskMatrix.tsx` | `movementArrowTitle` helper + per-path titles + SVG `<title>` + hit-line |
| `src/lib/risk-residual.ts` | `describeAcceptedResidual` pure one-liner |
| `src/app-layer/usecases/risk-residual-suggestion.ts` | accept returns `{ ...suggestion, summary }` |
| `src/app/t/[tenantSlug]/(app)/risks/[riskId]/RiskAssessmentPanel.tsx` | accept toast + adaptive bridge + `fairAle` prop |
| `src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx` | plumbs `fairAle` into the panel |
| `tests/unit/risk-residual.test.ts` | `describeAcceptedResidual` cases |
| `tests/unit/movement-arrow-title.test.ts` | bounded title composer |
| `tests/unit/risk-residual-suggestion.test.ts` | accept returns `.summary` |
| `tests/rendered/risk-matrix-movement.test.tsx` | `<title>` content + pointer-events |
| `tests/rendered/risk-assessment-panel.test.tsx` | accept toast from server response + bridge copy |
| `tests/guards/rq3-ob-d-closed-loops.test.ts` | structural ratchet across all three loops |

## Decisions

- **Native SVG `<title>`, not the React Tooltip primitive.** The movement
  overlay is an SVG with `pointer-events: none`; wrapping individual `<g>`
  groups in a Radix-backed tooltip (which expects HTML triggers) inside SVG
  is fragile. The native `<title>` is the SVG-idiomatic, screen-reader-
  friendly choice, and a single arrow `<g>` opting into pointer events keeps
  the rest of the overlay click-through.
- **Toast one-liner composed server-side.** The whole point of the RQ2-2
  accept contract is "the server recomputes; the client never asserts the
  numbers." The toast text follows the same discipline — derived from the
  recomputed `suggestion`, returned in the response, never re-derived on the
  client where it could drift from what was persisted.
- **`{ ...suggestion, summary }` spread, not a wrapper object.** Keeps the
  existing `acceptResidualSuggestion` return contract (callers read
  `.residualLikelihood` etc.) intact while adding `.summary`. A wrapper
  `{ suggestion, summary }` would have broken the unit test + the route
  shape for no benefit.
- **Bounded at 8 + overflow.** Long enough to name the meaningful movers,
  short enough to stay a tooltip. The bound is an exported constant so a
  future tuning is one edit + a ratchet update.

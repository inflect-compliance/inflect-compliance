# R18 — Charts II: Fluid & Glossy

The R16 (lickable) wave gave the charts gradient fills, hover-pop,
and the flowing-river hover effect. This R18 wave makes them **fluid,
glossy, and bubbly**: glass catch-lights, springy buoyant motion,
and smooth tweening between data states.

This doc is the contributor guide — the decision tree for picking
a primitive, the two-layer paint contract, and the motion
vocabulary.

## The two-layer paint

Every "glossy" chart surface is **two stacked shapes with the same
geometry**:

```tsx
{/* 1. colour layer — the series gradient (R16) */}
<path d={arc} fill={`url(#${colourId})`} />
{/* 2. gloss layer — the SAME d, the light on top (R18) */}
<path d={arc} fill={`url(#${glossId})`} pointerEvents="none" aria-hidden />
```

The gloss layer's white→transparent ramp shows the colour layer
through everywhere except the sheen band. The overlay is **always
inert** — `pointerEvents="none"` + `aria-hidden` — it carries
light, not data.

## Primitives

### `<ChartGloss>` — static catch-light (PR-1)
A `<linearGradient>` def. White → transparent ramp; the 45% knee
concentrates the sheen so it reads as a *highlight*, not a wash.

- `direction`: `vertical` (light from above) / `diagonal`
- `intensity`: `subtle` (0.18) / `default` (0.32) / `bright` (0.48)
- `chartGlossId(chartId, seriesIndex?)` — id builder

**Pick `subtle`** for tiny/dense surfaces (sparklines).
**Pick `default`** for full-size charts (donut, line, bars).
**Pick `bright`** for hero surfaces where the gloss IS the
statement.

### `<ChartSheenSweep>` — moving catch-light (PR-10)
A `forwardRef` `<linearGradient>` — transparent → white-band →
transparent — that a motion hook pans across the surface. Where
`<ChartGloss>` is the light *sitting on* glass, `<ChartSheenSweep>`
is the light *travelling across* it.

Pair it with `useChartSheen` (below). `chartSheenId(chartId)` is
the id builder.

## Motion hooks (chart-motion.tsx)

### `useChartSpring()` — bubbly-settle entrance (PR-2)
Returns a number that springs `0 → ~1.05 (overshoot) → 1` on
mount via an `easeOutBack` cubic. Map it onto a `scale()`, an arc
radius, a bar height — anything that should "bubble in."

**SSR-safe by construction**: returns `1` on the server + first
client render (markup === settled chart), the spring only engages
after the mount effect. This is the lesson R17-PR5 (count-up) was
deferred over — designed out here.

```tsx
const entrance = useChartSpring();
<g transform={`translate(${cx},${cy}) scale(${entrance})`}>…</g>
```

### `useChartSheen({ distance, direction })` — periodic light pan (PR-10)
Returns a ref for a `<ChartSheenSweep>`. Pans its
`gradientTransform` on a slow ~5s loop (`CHART_SHEEN_PERIOD_MS`).
Always-on ambient polish — distinct from `useChartFlow` (R16),
which is hover-gated + fast.

```tsx
const sheenRef = useChartSheen({ distance: size });
<defs><ChartSheenSweep ref={sheenRef} id={chartSheenId(chartId)} /></defs>
```

### When to reach for a framer-motion spring directly
For **hover** bubble-outs (line focus point PR-7, bar hover PR-9)
— `useChartSpring` is mount-only. Use a framer-motion
`transition={{ type: 'spring', stiffness, damping }}` on the
hovered element's `animate`. Start from `scale: 0` so the bubble
grows from nothing (a `1 → 1.05` spring barely registers).

### Fluid data-change morphing (PR-11)
For shapes whose geometry changes when data changes, use
`<motion.path animate={{ d }} initial={false}>`. `initial={false}`
is load-bearing — it means no mount animation, so the morph only
fires on UPDATE and doesn't fight the bubble-entrance.

## CSS-side vocabulary (PR-3)

For chart surfaces that animate via a className rather than a
per-shape progress value:

- `shadow-chart-soft` — the soft drop shadow a chart surface
  casts to lift off the card. Theme-tuned (`--chart-soft-shadow`).
- `animate-chart-bubble-in` — the pure-CSS sibling of
  `useChartSpring`. `scale(0.8) → 1.05 → 1`, 520ms (matches
  `CHART_SPRING_DURATION_MS`).

## Reduced motion

Every R18 motion hook (`useChartSpring`, `useChartSheen`) routes
through the shared `useReducedMotion` — under
`prefers-reduced-motion: reduce` they return the settled value /
never start the loop. The CSS keyframes are flattened by the
global rule in `tokens.css`. No per-component opt-in.

## What got the treatment

| Chart | Gloss | Sheen sweep | Bubble entrance | Hover bubble | Data morph |
|---|---|---|---|---|---|
| DonutChart | ✅ PR-4 | ✅ PR-10 | ✅ PR-5 | (R16 hover-pop) | ✅ PR-11 |
| MiniAreaChart | ✅ PR-6 | — | (d-morph entrance) | — | (d-morph) |
| LineChart | ✅ PR-7 | — | (R16 path-draw) | ✅ PR-7 | — |
| Bars | ✅ PR-8 | — | ✅ PR-8 | ✅ PR-9 | — |

Empty cells are deliberate, not gaps — e.g. the sheen sweep is a
donut-only showcase for now; extending it to line/bars is a clean
follow-up that just wires the existing primitive + hook.

## Ratchet layout

Per-PR ratchets live in `tests/guards/r18-*.test.ts`. The capstone
at `tests/guards/r18-capstone-rollout.test.ts` is the inventory —
it locks every R18 deliverable's presence so a future "let's
simplify" diff that silently drops one fails CI.

Adding a new R18 surface? Three steps:
1. Write the per-PR ratchet next to the file you edit.
2. Append a `describe` block to `r18-capstone-rollout.test.ts`.
3. Update this doc.

# 2026-06-30 — Reliable org-dashboard chart rendering (kill the blank radar)

**Commit:** `<sha> fix(org-dashboard): reliable chart rendering — kill blank radar + 0-height charts`

## Design

The deployed org dashboard rendered the **Security Maturity radar** as a
blank gray box. This was a **rendering-reliability** bug, not a data bug
(the widget showed "3.0 / 5 Defined" — the data was present; the chart
was unsized).

### Root cause (corrected from the original premise)

IC charts are responsive: `<ChartFrame>` (the shared wrapper behind
radar / line / gantt) sizes via `@visx/responsive`'s `ParentSize`, which
**measures its box** and hands `{width, height}` to a render-prop. The
original premise blamed "charts rendered outside `ChartRenderer` get no
`min-h-[160px]` guard." That is inaccurate — the radar goes **through
`ChartFrame`, which already had** `min-height: 240`, a 0-size guard, and
loading/empty/error states.

The actual collapse had two compounding causes:

1. **The widget container could collapse.** `OrgMaturityWidget` wrapped
   the radar in `<div className="min-h-0 flex-1">`. `min-h-0` removes a
   flex child's default `min-height: auto`, so in a height-constrained
   dashboard grid the slot shrank below the chart.
2. **The measured area's height never resolved.** Inside `ChartFrame`,
   `ParentSize` sat on a `size-full` (`height: 100%`) element. A
   percentage height resolves against the parent's *definite* height —
   but the frame had only a `min-height` (indefinite height), and the
   outer was `flex items-center justify-center` (which doesn't stretch
   the child). So `ParentSize` measured `height: 0`, the render-prop
   short-circuited (`if (height === 0) return null`), and the chart
   painted nothing.

### The contract (one hardened container, applied everywhere)

`<ChartFrame>` is now the single hardened chart container. Every branch
(skeleton, empty, error, and the measured chart) renders inside a
`relative` box with a definite `min-height`, and its content is
positioned **`absolute inset-0`**. Because the absolute child is out of
flow, the box's *used* height collapses to its `min-height` floor — so
`ParentSize` always measures a real, non-zero box, no matter how the
parent flexes.

Three further guarantees:

- **Client-only.** A `mounted` gate (`useState(false)` → `useEffect`)
  shows the skeleton until hydration, so the DOM-measuring auto-sizer
  never runs against a 0×0 SSR/first-paint box.
- **Floor a 0 measure.** If a measure still yields `height === 0`
  (transient), the render-prop uses the `min-height` floor instead of a
  0-tall chart. A 0 *width* (genuinely unmeasurable — detached /
  `display:none`) shows the skeleton, never a blank.
- **Empty, not blank.** The maturity radar now gates on `isDefault` /
  an empty axis set → `chartEmpty()`, rendering "Rate your maturity to
  populate this radar." at full height instead of a blank box.

## Files

| File | Role |
|---|---|
| `src/components/ui/charts/chart-frame.tsx` | Hardened: absolute-inset-0 fill, mounted gate, height floor, skeleton-on-unmeasurable. |
| `src/app/org/[orgSlug]/(app)/OrgMaturityWidget.tsx` | Radar slot `min-h-0 flex-1` → `min-h-[260px] flex-1`; empty-state gating + maturity `emptyFallback`. |
| `src/components/ui/charts/radar-chart.tsx` | Forwards an `emptyFallback` passthrough to `ChartFrame`. |
| `tests/guardrails/dashboard-chart-rendering.test.ts` | Structural ratchet for the sized/client-only/with-states contract. |
| `tests/rendered/dashboard-radar-render.test.tsx` | Regression lock — radar SVG with data, empty state without. |
| `tests/guards/r16-chart-frame.test.ts` | Zero-size assertion updated to the new (split) guard shape. |

## Decisions

- **Fix the shared frame, not the one widget.** Hardening `ChartFrame`
  fixes radar, line, and gantt at once and prevents the next bolt-on
  chart from regressing — the ratchet enforces the contract on the
  frame, the maturity widget, and `ChartRenderer`.
- **`absolute inset-0` over an explicit pixel `height`.** Keeps the
  chart responsive (it still grows when the container is taller) while
  guaranteeing the `min-height` floor — an aspect-ratio box or a fixed
  height would have lost the responsiveness `ParentSize` exists for.
- **Mounted gate over `dynamic(ssr:false)`.** One pattern, in the shared
  frame, so every consumer is client-safe without each call site
  remembering to dynamic-import. Keeps the SSR'd markup as a sized
  skeleton (no layout shift) rather than nothing.
- **Not a redesign, not a data fix, no library swap.** Pure
  rendering-reliability on the existing custom primitives (recharts /
  chart.js remain banned).

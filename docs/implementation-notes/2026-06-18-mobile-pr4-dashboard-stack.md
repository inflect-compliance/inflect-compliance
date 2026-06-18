# 2026-06-18 — Mobile PR-4: dashboard single-column stack on phones

**Commit:** `<sha>` feat(mobile): dashboard renders a single-column stack on phones

Fourth PR of the mobile roadmap.

## Design

`<DashboardGrid>` wraps react-grid-layout (a 12-column drag/resize grid). On a
375px phone that's unusable — columns are cramped and touch drag/resize fights
the page scroll. Below `md`, `<DashboardGrid>` now renders the widgets as a
**full-width vertical stack** (plain flex column, no RGL), ordered by the
laid-out reading order (`y` then `x`):

```
const belowMd = useIsBelowMd();
if (belowMd) return <div data-dashboard-stacked> …widgets in y/x order… </div>;
// else the ResponsiveGridLayout drag grid
```

`useIsBelowMd` is `false` on SSR/first-render and under jsdom, so desktop and
every existing DashboardGrid test keep the grid; the stack is exercised by
mocking the hook.

**Premise verified, not padded.** Two roadmap items for PR-4 were already
satisfied and left untouched (the ratchet now locks them):
- **HeroMetric** already stacks on mobile (`flex flex-col … md:flex-row`).
- The shared **chart x-axis** already derives tick density from width
  (`pickXAxisTickCount(width)` → 4 ticks under 450px), so dense time-series
  axes don't overlap on phones.

`useIsBelowMd` was promoted from the table module to the shared hooks dir
(`@/components/ui/hooks/use-is-below-md`); `table/use-is-below-md` re-exports it
for back-compat, and the PR-2 ratchet was repointed at the canonical path.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/hooks/use-is-below-md.ts` | canonical shared `< md` hook (promoted from table) |
| `src/components/ui/table/use-is-below-md.ts` | now re-exports the canonical hook |
| `src/components/ui/dashboard-widgets/DashboardGrid.tsx` | mobile single-column stack branch |
| `tests/rendered/dashboard-grid-mobile-stack.test.tsx` | desktop→grid; mocked phone→stack in layout order |
| `tests/guards/mobile-dashboard-stack.test.ts` | ratchet: stack branch, HeroMetric responsive, x-axis width-tick |
| `tests/guards/mobile-datatable-cards.test.ts` | repointed hook-safety check at the canonical path |

## Decisions

- **Stack, not a responsive RGL.** react-grid-layout's `Responsive` needs
  per-breakpoint layouts; for a phone the right answer is no grid at all — a
  simple vertical stack drops the touch-hostile drag/resize and is the natural
  mobile reading order.
- **Charts/HeroMetric left alone.** They were already responsive; re-doing them
  would be busywork. The ratchet keeps them that way.

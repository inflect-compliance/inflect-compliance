# 2026-06-18 — Mobile PR-3: popover / dropdown viewport-clamp hardening

**Commit:** `<sha>` feat(mobile): clamp floating surfaces to the viewport (no horizontal overflow)

Third PR of the mobile roadmap. **Premise correction:** the roadmap planned to
"stack the filter toolbar / detail header / tab bar," but the R7/R14 composition
primitives already do that — `PageHeader` is `flex items-start justify-between
flex-wrap`, `FilterToolbar` is `flex flex-wrap`, and the entity tab bar is
`overflow-x-auto whitespace-nowrap` (scrolls). So those reflow correctly today.

The genuine remaining mobile bug class is **floating surfaces wider than the
viewport** — a `w-screen` dropdown (100vw overflows by the scrollbar width) or a
fixed `w-[NNNpx]` panel bigger than a 320px phone forces horizontal scroll on
the whole page. This PR clamps every such surface and ratchets it.

## Changes

| Surface | Was | Now |
| --- | --- | --- |
| Combobox dropdown (`combobox/index.tsx`) | `sm:w-[trigger]`, no mobile cap | + `max-w-[calc(100vw-1rem)]` |
| Org switcher popover | `w-[260px]` | + `max-w-[calc(100vw-1rem)]` |
| Notifications panel | `w-[340px]` (> 320px phones) | + `max-w-[calc(100vw-1rem)]` |
| Numeric range panel (`filter-range-panel`) | `min-w-[282px] max-w-[282px]` always | `w-full` on mobile, fixed only `sm:` |
| Column gear (`checklist-gear-button`) | `w-screen` | + `max-w-[calc(100vw-0.5rem)]` |
| Edit-columns list | `w-screen` | + `max-w-[calc(100vw-0.5rem)]` |
| Combobox/filter scroll wrappers (`scroll-container`, `filter-list`, `filter-scroll`) | `w-screen` | + `max-w-[calc(100vw-0.5rem)] sm:max-w-none` |

`w-screen` is kept (full-width dropdowns are the right mobile UX); the
`max-w-[calc(100vw-…)]` cap removes the scrollbar-width overflow.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/combobox/index.tsx` | dropdown viewport cap |
| `src/components/org-switcher.tsx`, `src/components/layout/notifications-bell.tsx` | popover caps |
| `src/components/ui/filter/filter-range-panel.tsx` | mobile full-width, fixed at sm+ |
| `src/components/ui/checklist-gear-button.tsx`, `src/components/ui/table/edit-columns-button.tsx` | gear/list w-screen caps |
| `src/components/ui/scroll-container.tsx`, `src/components/ui/filter/filter-list.tsx`, `src/components/ui/filter/filter-scroll.tsx` | scroll-wrapper caps |
| `tests/guards/mobile-popover-viewport-clamp.test.ts` | forward ratchet: every `w-screen` paired with a `max-w-[calc(100vw-…)]`; known fixed-width surfaces clamped |

## Decisions

- **Scoped PR-3 to the genuine gap.** The planned toolbar/header/tab stacking
  was already satisfied by the composition primitives — re-doing it would be
  busywork. Verified by reading the actual class strings, per the
  "verify-roadmap-premise" rule. The honest slice is overflow hardening.
- **Forward-looking ratchet, not just curated sites.** The guard scans ALL
  component `.tsx` for unclamped `w-screen`, so a new wide dropdown can't
  re-introduce the bug. `max-w-screen-*` (a max-width cap) is explicitly not
  flagged.
- The full mobile horizontal-overflow E2E sweep across list pages lands in PR-5
  (the test-harness PR) so the device-preset Playwright config and the sweep
  ship together.

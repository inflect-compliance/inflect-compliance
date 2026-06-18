# 2026-06-18 — Canonical dropdown: option names never truncate

**Commit:** `<sha>` feat(ui): dropdowns never truncate option names + ratchet

## Design

Audited every "dropdown" option surface and made the canonical rule:
**an open dropdown's option rows render the FULL option label — wrap
(`whitespace-normal` + `break-words`), never `truncate` / `text-ellipsis` /
`line-clamp`, and never a JS `truncate(label, N)`.**

Scope is the OPEN option list only. Dropdown **triggers** (the button showing
the already-selected value) stay truncating — they're width-constrained chrome,
and un-truncating them widens toolbars/navbars unpredictably (operator chose
"options only"). Native `<select>` elements are exempt — the browser renders
their option text in full.

### Surfaces segregated + their state

| Surface | Before | After |
| --- | --- | --- |
| `Combobox` non-virtualized | already wrapped | unchanged (compliant) |
| `Combobox` virtualized (`virtualized-options.tsx`) | fixed 36px row + `truncate` | **variable row height + wrap** |
| `Combobox` "Create …" row | `grow truncate` | `grow break-words` |
| Filter value options (`filter-list.tsx`) | `truncate(optionLabel, 48)` + nowrap | full label + wrap |
| Filter category/options (`filter-select.tsx`) | `truncate(label, 48)` + nowrap | full label + wrap; `truncate` import dropped |
| Column/filter-card gear (`checklist-gear-button.tsx`) | `truncate` + nowrap | `break-words` + wrap |
| Shared `Popover.Item` (menu primitive) | `flex-1 truncate` | `flex-1 break-words` |
| Tenant/workspace switcher rows | `truncate` | `break-words` |
| Org switcher rows | `flex-1 truncate` | `flex-1 break-words` |
| Native `<select>` (8 sites) | browser-native | exempt (no app truncation) |

### The hard part — virtualized rows

react-window needs a deterministic per-row height; a fixed height clips wrapped
labels. `VirtualizedComboboxOptions` now computes a **variable** `itemSize`:
an offscreen-canvas greedy word-wrap measures each label's line count against
the rendered panel width (tracked via `ResizeObserver`), and the row height
grows with it. Biased to over-estimate (generous horizontal chrome reserve) so
a row is never shorter than its content — under-estimating would overlap the
next row. Falls back to single-line height when measurement is unavailable
(SSR / jsdom has no canvas), and `resetAfterIndex(0)` invalidates react-window's
offset cache when width or options change. The Epic 68 DOM-count + wall-clock
benchmark (`combobox-virtualize.test.tsx`) still passes.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/combobox/index.tsx` | create-row wrap |
| `src/components/ui/combobox/virtualized-options.tsx` | variable-height wrap + canvas line measurement |
| `src/components/ui/filter/filter-list.tsx` | option label full + wrap |
| `src/components/ui/filter/filter-select.tsx` | option label full + wrap; drop `truncate` import |
| `src/components/ui/checklist-gear-button.tsx` | item label wrap |
| `src/components/ui/popover.tsx` | `Popover.Item` label wrap |
| `src/components/layout/tenant-switcher.tsx` | row labels wrap |
| `src/components/org-switcher.tsx` | row labels wrap |
| `tests/rendered/dropdown-option-no-truncation.test.tsx` | behavioural proof (Combobox both branches) |
| `tests/guards/dropdowns-no-option-truncation.test.ts` | structural ratchet across all surfaces |

## Decisions

- **Wrap, not widen-panel.** Wrapping is the already-established Combobox
  pattern and handles arbitrary-length names without overflowing the viewport.
  One canonical strategy across all surfaces.
- **Options only, triggers untouched.** Matches the request ("names of the
  options") and keeps toolbar/navbar layout stable.
- **Canvas measurement over a fixed 2-line clamp.** A clamp would still truncate
  3+-line names; the requirement is *never*. Deterministic measurement keeps
  react-window correct while guaranteeing full visibility.

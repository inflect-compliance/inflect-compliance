# 2026-06-01 — DataTable mouse column resizing (measure-then-fix)

**Commit:** `<sha> feat(table): enable mouse-resizable columns via measure-then-fix`

## Design

`<DataTable>` columns are now resizable with the mouse, on by default
for the non-virtualized table. The hard constraint: precise
drag-resize needs `table-layout: fixed`, but a fixed layout needs an
explicit width per column — and a uniform default width would squish
every list page (long title columns truncated, short status columns
over-wide).

The B2 work had already shipped an `enableColumnResizing` prop +
TanStack wiring + a drag-handle affordance, but two things meant it
never actually did anything in production:

1. `DataTable` never forwarded the prop into the `useTable` props,
   so it was silently dropped at the component boundary.
2. The fixed-layout path defaulted every column to `size: 120`, so
   even if wired it would have rendered uniform 120px columns.

**Measure-then-fix** closes both gaps without a per-page width audit:

```
mount → render ONE auto-layout frame (no per-column widths)
      → browser sizes each column to its content
      → useLayoutEffect measures each <th> width (getBoundingClientRect)
      → table.setColumnSizing(measured)   // seed TanStack sizing state
      → setSizingFrozen(true)             // flip to table-layout: fixed
      → paint                             // identical widths + drag handles
```

The auto frame is one pre-paint layout pass (the effect is
`useLayoutEffect`), so the user never sees it. The seeded widths equal
the content widths the old auto table produced, so every list page
looks the same — it just gains drag handles and adjustable widths.

A user drag updates TanStack's sizing state directly; the header row
re-renders and, in fixed layout, drives the column widths for the
whole table. `measuredColumnKey` tracks the visible-column set so a
visibility toggle re-measures (drop to auto for one frame, re-measure,
re-freeze) while a drag leaves the key untouched and persists.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/table/data-table.tsx` | Forward `enableColumnResizing` (default `true`) into both `tableProps` branches; gate it OFF for virtualized tables via an up-front `willVirtualizeEarly` calc; updated prop doc |
| `src/components/ui/table/table.tsx` | `defaultColumn` resizing sizes (min 64, no max cap); `sizingFrozen` state + `useLayoutEffect` measure-then-fix; `applyFixedLayout` gates `table-layout` / `<th>` width / row variant; `data-column-id` on each `<th>`; `tableElRef` |
| `tests/rendered/data-table-column-resize.test.tsx` | Tier-2 proof: stubs `getBoundingClientRect` per column, asserts distinct seeded widths + fixed layout + one handle per content column + no handles when virtualized |

## Decisions

- **Default ON, not opt-in.** The request was "make table columns
  resizable" — app-wide. Measure-then-fix makes that safe because it
  preserves each table's existing content widths. Pages opt out with
  `enableColumnResizing={false}`.
- **Virtualized tables excluded.** `VirtualTable` reads `getSize()`
  straight into its `gridTemplateColumns` with no measure step, so
  the resizing defaults would collapse it to a uniform width. The
  decision is computed up-front in `DataTable` (the virtualization
  resolver is pure + hoisted) and resizing is gated on
  `!willVirtualizeEarly`. Tables above the 1000-row threshold simply
  render no handles — no regression.
- **`ResizableTableRow` (memoized) is now the production row path.**
  Before this change it was dead code (the prop never reached the
  table). Its memo re-renders on `row.original`/selection identity
  change — which covers every real update path here (SWR refetch and
  optimistic edits both replace row objects; selection is compared
  explicitly). An empirical scan of all 29 list column-definition
  files found no cell that closes over ticking/expand/external state,
  so the memo cannot stale a cell. The full rendered suite (1493
  tests) passes unchanged.
- **No `maxSize` cap.** The old path capped columns at 300px, which
  would have clipped genuinely wide columns on seed. Dropped so the
  seed never truncates and drags stay unconstrained; `minSize: 64`
  is the drag floor.
- **Measured in JS, not CSS.** There is no CSS-only way to get
  "content-sized initial width that is then user-adjustable" — fixed
  layout needs explicit widths. Measuring the auto frame is the
  standard solution.

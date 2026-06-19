# 2026-06-19 — Control inline task rows aligned to the table columns

**Commit:** `<sha> feat(table): aligned expandable sub-rows; control tasks line up on category/status/owner/evidence`

The inline task rows under an expanded control rendered as a free-form
`<div>` inside a single `colSpan` cell, so their fields did NOT line up with
the control table's columns. The user wants each task to align under
**Category / Status / Owner / Evidence** and match each column's format.

## Mechanism: `renderAlignedSubRows`

A colSpan blob can't align to auto-width columns. The fix adds a second
expandable-row slot to the `DataTable`/`Table` primitive:

- **`renderExpandedRow(row)`** (existing) — full-width `colSpan` slot.
- **`renderAlignedSubRows(row, columnIds)`** (new) — returns **real `<tr>`/`<td>`
  rows** rendered as direct `<tbody>` siblings. Because they're rows in the
  SAME `<table>`, the browser's table layout shares column widths, so the
  sub-row cells line up under the parent columns automatically. The primitive
  passes the ordered **visible column ids** so the consumer renders one `<td>`
  per column (empty for columns it has no value for).

The expand chevron now shows for EITHER prop. Expandable tables force the
non-virtualized `<Table>` (the virtual grid can't host either slot).

## Controls task rows

`ControlTaskRows` now emits one `<tr>` per task with a `<td>` per visible
column id, surfacing:

- **name** — task title, indented to read as a child.
- **category** — the parent control's category (inherited; `categorizeControl`,
  the SAME value the Category column shows) as a `StatusBadge` (tag).
- **status** — the task's own status as a `StatusBadge`, **`size="sm"`** to
  match the control status tag.
- **owner** — the assignee: avatar-initial circle + name (same markup as the
  Owner column).
- **evidence** — count via a `renderEvidence` render-prop supplied by the page,
  so the Paperclip glyph + colour are **identical** to the control row's
  Evidence cell (keeps the lucide import on the page, off `ControlTaskRows`,
  satisfying the `no-lucide` guard).

The whole `<tr>` is the click target (`cursor-pointer`) → task quick-view.
These cells are display-only — the list filter still targets controls, not the
sub-rows (no new filter dimensions).

## Files

| File | Change |
| --- | --- |
| `components/ui/table/types.ts`, `data-table.tsx` | New `renderAlignedSubRows` prop; forces non-virtualized; plumbed through. |
| `components/ui/table/table.tsx` | Render aligned sub-rows as tbody siblings; chevron gate covers both slots. |
| `components/layout/EntityListPage.tsx` | Expose the prop. |
| `controls/ControlTaskRows.tsx` | Emit aligned `<tr>`/`<td>` rows; category/status/owner/evidence cells. |
| `controls/ControlsClient.tsx` | `renderTaskEvidence` render-prop; switch to `renderAlignedSubRows`. |
| `tests/guards/controls-row-expansion.test.ts` + others | Lock the aligned-sub-rows wiring + per-column cells. |

## Decisions

- **Real `<tr>`/`<td>` in the same table, not a nested table or CSS grid** —
  only same-table rows share the parent's auto-sized column widths; a nested
  table or grid can't know them.
- **Evidence via render-prop**, not a duplicated icon — guarantees pixel-identical
  cells without adding a new `no-lucide` exemption.
- **Kept `renderExpandedRow`** (colSpan) as the generic slot for non-aligned use.

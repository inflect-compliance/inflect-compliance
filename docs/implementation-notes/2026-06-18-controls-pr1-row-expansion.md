# 2026-06-18 — Controls PR-1: DataTable row-expansion + inline task nesting

**Commit:** `<sha>` feat(controls): expandable rows + inline task nesting (TidalControl roadmap PR-1)

First PR of the Controls TidalControl-interaction roadmap. Adds a **row-expansion
capability to the shared `<DataTable>`** and uses it on the Controls table to
nest each control's tasks inline (Tidal-style chevron).

## Design

**Primitive (`table.tsx` / `data-table.tsx` / `types.ts`).** Two new optional
props on the shared table surface:
- `getRowCanExpand?(row) => boolean` — feeds tanstack's `getRowCanExpand`.
- `renderExpandedRow?(row) => ReactNode` — the expanding sub-component.

`useTable` now wires `getExpandedRowModel()` + an internal `expanded` state.
When a consumer passes `renderExpandedRow` and a row can expand, the first
content cell grows a leading chevron (`row.toggleExpanded()`, `stopPropagation`
so it never triggers row select/navigate), and an expanded row renders
`renderExpandedRow(row)` in a `colSpan`-full `<tr data-expanded-subrow>`.

**Default-off contract (load-bearing — DataTable backs every list page):**
without `renderExpandedRow` no chevron renders, `getRowCanExpand` defaults to
tanstack's `() => false`, the row markup is a transparent `Fragment` wrapper
(no DOM node added), and the expanded `<tr>` is never emitted. Existing tables
are byte-unchanged. Expansion lives only on the non-virtualized `<Table>` path
(Controls is the canonical `virtualize={false}` page); the virtualized branch
ignores it.

**Controls (`ControlsClient.tsx` + `ControlTaskRows.tsx`).** A control with
tasks (`taskTotal`/`_count.controlTasks > 0`) is expandable; expanding mounts
`<ControlTaskRows>`, which **lazy-fetches** `GET /tasks?linkedEntityType=
CONTROL&linkedEntityId=:id` (one request per control, on first expand) and
renders the tasks as an indented list (title link, assignee, status badge).
Callbacks are `useCallback`-stable so a select/expand re-render doesn't rebuild
the table model (the file's existing memoisation discipline).

## Files

| File | Role |
| --- | --- |
| `src/components/ui/table/types.ts` | `getRowCanExpand` + `renderExpandedRow` on `BaseTableProps` |
| `src/components/ui/table/table.tsx` | expanded model in `useTable`; chevron + sub-row in `<Table>` |
| `src/components/ui/table/data-table.tsx` | pass-through of both props |
| `src/components/layout/EntityListPage.tsx` | add both to the `Pick`ed table surface |
| `src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx` | opt in (stable callbacks) |
| `src/app/t/[tenantSlug]/(app)/controls/ControlTaskRows.tsx` | lazy task list (expanded content) |
| `tests/rendered/data-table-row-expansion.test.tsx` | chevron toggle, default-off, per-row gating |
| `tests/guards/controls-row-expansion.test.ts` | primitive wiring + Controls opt-in + lazy fetch |

## Decisions

- **tanstack expanded model, not manual state.** Reuses the framework's
  `getExpandedRowModel` + `row.getIsExpanded()` so the expansion state lives in
  the one table instance; the consumer only supplies "can this expand" + "what
  to render."
- **Lazy fetch on expand**, not pre-loaded with the list — keeps the controls
  list query lean; tasks load only for the controls a user actually opens.
- **Tasks read-only here.** PR-2 makes a task click open the task quick-view in
  the side panel (this PR is the table-structure half).

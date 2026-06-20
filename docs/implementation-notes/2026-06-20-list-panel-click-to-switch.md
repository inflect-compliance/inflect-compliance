# 2026-06-20 — List side-panels: click-to-switch (non-modal)

**Commit:** `<sha> fix(lists): click-to-switch side panels on Controls + Tasks`

The Controls and Tasks list pages let you open a row's editable side panel.
Switching to another row used to take **two clicks** — one to dismiss the open
panel, another to open the next — because a full-viewport overlay sat over the
table and swallowed the first click. Now a single click on another control /
task switches the panel in place.

## Root cause (Controls)

`<AsidePanel>` is a non-modal co-resident rail: docked column ≥xl, `<Sheet>`
fallback <xl. But its `openOnMount` effect called `setSheetOpen(true)`
**unconditionally**, so on ≥xl the Sheet opened *too* — and `<Sheet>`'s
`Drawer.Overlay` (`fixed inset-0 z-40`, transparent for the AsidePanel) covered
the whole viewport. A click on the table hit the overlay → Vaul dismissed the
sheet → the click was spent on closing, not switching. (This was the same
double-render the #1137 E2E worked around with `.first()`.)

Fix: `openOnMount` now reads the viewport synchronously and opens the Sheet
**only below xl** (where the docked rail is hidden). ≥xl relies solely on the
docked rail — no overlay, table fully clickable.

Second Controls fix: the quick-view `<AsidePanel>` was keyed by *type*
(`qv-control` / `qv-task`). `ControlEditPanel` / `TaskEditPanel` seed their form
state on mount only, so a control→control switch (same key → reused instance)
left the previous row's data in the fields. Keyed by **id** now
(`qv-control-${id}`), so every distinct selection forces a fresh mount → the
panel re-seeds.

## Tasks page — matched to Controls

The Tasks list used a **modal** `<TaskDetailSheet>` (dimming/blurring overlay)
opened by a row pencil; a plain row-click navigated away. Per the product
decision it now matches Controls:

- single-click a task **title** (or the row pencil) → opens the editable task in
  a non-modal `<AsidePanel>` + `<TaskEditPanel>` (reused from the Controls page);
- the table stays visible → clicking another task switches the panel in place;
- row **double-click** still navigates to the full detail page.

`TaskDetailSheet.tsx` (the modal, 595 lines) was deleted — fully orphaned after
the swap. `TaskEditPanel`'s "← Back" affordance became optional (no parent
control on the Tasks page).

## Files

| File | Role |
|------|------|
| `src/components/ui/aside-panel.tsx` | `openOnMount` opens the Sheet only `<xl` (viewport read synchronously) |
| `…/controls/ControlsClient.tsx` | quick-view `<AsidePanel>` keyed by entity id |
| `…/controls/TaskEditPanel.tsx` | `onBack` now optional (hidden on the Tasks page) |
| `…/tasks/TasksClient.tsx` | title/pencil open a non-modal `<AsidePanel>`+`<TaskEditPanel>`; `<TaskDetailSheet>` removed |
| `…/tasks/TaskDetailSheet.tsx` | **deleted** (orphaned modal) |
| `tests/guards/controls-quickview-interaction.test.ts` | asserts id-keyed panels + the `<xl` Sheet gate |
| `tests/guards/tasks-quickview-interaction.test.ts` | NEW — locks the Tasks-page non-modal migration |
| `tests/guards/ux-foundation-ratchets.test.ts` | confirm-ceiling 18 → 17 (deleted modal removed a `window.confirm`) |

## Decisions

- **Gate the Sheet to `<xl` rather than make the overlay click-through.** Vaul
  dismisses on pointer-down-outside the Content regardless of the overlay's
  pointer-events, so a transparent/pointer-events-none overlay alone wouldn't
  stop the close. On ≥xl the docked rail is already the surface — not opening the
  Sheet there is both the bug fix and the architecturally-intended behaviour.
- **Reuse `TaskEditPanel` on the Tasks page** instead of converting
  `TaskDetailSheet` to non-modal — exact UX parity with Controls, far less code,
  and the panel already re-fetches full detail via `GET /tasks/{id}`.
- **Deleted `TaskDetailSheet`** rather than leaving dead code; its
  unsaved-changes `window.confirm` guard goes with it (the non-modal panel
  matches Controls, which carries no such guard).

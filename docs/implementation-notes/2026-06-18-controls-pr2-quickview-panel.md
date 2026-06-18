# 2026-06-18 — Controls PR-2: quick-view side panel + click pattern + task quick-view

**Commit:** `<sha>` feat(controls): name→quick-view side panel + task quick-view (TidalControl roadmap PR-2)

Second PR of the Controls TidalControl-interaction roadmap. Gives the Controls
table the full Assets click pattern + a docked control/task quick-view.

## Design

**Click pattern (mirrors Assets, locked by `item-27-32-34-asset-ux`).** The
name cell becomes a `<button>` (inline, `stopPropagation`) that opens the
**control quick-view** — so name-click = quick-view, row single-click = select,
row double-click = full `/controls/:id` detail (unchanged). The button is
skipped by the table's `isClickOnInteractiveChild`, so it never selects/navigates.

**Quick-view surface = responsive `AsidePanel`** (docked ≥xl, Sheet <xl — the
roadmap decision). When a control or task is selected, the existing Controls
rail (Browse / Best-value / AI) is **replaced** by the quick-view (Tidal-style
takeover); closing returns to the default rail.
- `ControlQuickView` renders a condensed summary from the row data already in
  hand (**no fetch** — code, status, description, category, owner, task
  progress) + a Tasks section (the PR-1 `ControlTaskRows`, lazy-fetched) + a
  "Full view →" link.
- Clicking a task (an inline expanded row from PR-1, OR a row in the panel's
  Tasks section) opens `TaskQuickView` in the same panel — rendered from the
  already-fetched task object (**no new endpoint**) — with a "Back to control"
  affordance.

**`AsidePanel` gained two small props** so a panel that mounts in response to a
click shows immediately: `openOnMount` (expand the rail / open the Sheet on
mount) and `onClose` (clear the selection when the Sheet is dismissed <xl).
`?aside=controls-quickview` deep-link still works via the existing one-shot.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/aside-panel.tsx` | `openOnMount` + `onClose` |
| `…/controls/ControlsClient.tsx` | name→button; `selectedControl`/`selectedTask` state; quick-view takeover of the aside |
| `…/controls/ControlQuickView.tsx` | control summary + tasks (new) |
| `…/controls/TaskQuickView.tsx` | task quick-view from the task object (new) |
| `…/controls/ControlTaskRows.tsx` | `onTaskClick` → task rows become quick-view triggers |
| `tests/rendered/control-task-quickview.test.tsx` | both panels + the task-click flow |

## Decisions

- **Quick-view renders from data in hand**, no extra fetch for the control
  (row data) or the task (the clicked object). Only the control's task LIST is
  fetched (lazy, shared with PR-1's inline expansion).
- **Takeover, not stacking.** The quick-view replaces the rail content rather
  than stacking above Browse/Best-value/AI — matches Tidal and keeps the rail
  focused on one thing.
- The comprehensive ratchet (mirror `item-27-32-34-asset-ux` for Controls) +
  a11y/keyboard/empty-loading polish land in PR-3.

# 2026-06-19 — Controls PR-4: tasks live inline in the table, not in the quick-view panel

**Commit:** `<sha> fix(controls): tasks render inline in the table, never in the quick-view panel`

## Design

The Controls TidalControl roadmap (PR-1..PR-3, #1126/#1127/#1128) shipped two
places a control's tasks could appear:

1. **Inline in the table** — expand a control row (chevron) → `ControlTaskRows`
   lazy-fetches and lists the tasks as indented sub-rows (PR-1).
2. **In the side panel** — `ControlQuickView` (opened by clicking the control
   NAME) also rendered a "Tasks" section via `ControlTaskRows` (PR-2).

Per the product decision, tasks belong **below the control in the table only**,
not duplicated in the sidebar. This PR removes the Tasks list from the
quick-view panel. The panel keeps a single summary stat (`Tasks: 1/2 done`) —
a metric, not the list.

The task → task-quick-view flow is unchanged in behaviour: clicking a task in
the inline table rows (`ControlTaskRows`, `onTaskClick={setSelectedTask}`) still
opens `TaskQuickView` in the same `AsidePanel`. Only the duplicate panel-side
entry point is gone.

## Files

| File | Change |
| --- | --- |
| `controls/ControlQuickView.tsx` | Drop the in-panel Tasks list + the now-unused `ControlTaskRows` import, `tenantSlug` prop, and `onTaskClick` prop. Summary `Tasks: x/y done` stat retained. |
| `controls/ControlsClient.tsx` | `<ControlQuickView>` usage drops `tenantSlug` + `onTaskClick`. Inline `renderControlTaskRows` keeps `onTaskClick={setSelectedTask}`. |
| `controls/TaskQuickView.tsx` | Header comment: task is reached only from inline table rows. |
| `tests/rendered/control-task-quickview.test.tsx` | ControlQuickView render calls drop the removed props; the task-click coverage moves to a new `ControlTaskRows` describe; added a negative assertion that the panel lists no task. |
| `tests/guards/controls-quickview-interaction.test.ts` | New assertion: tasks live only inline (`renderExpandedRow: renderControlTaskRows`); the quick-view must not import/mount `ControlTaskRows` or `onTaskClick`. |

## Decisions

- **Kept the `Tasks: x/y done` summary stat in the panel** — it's a single
  progress metric (like the Tidal panel header), not the task list the decision
  is about. The *list* is what moved out.
- **Locked the absence** with a negative ratchet assertion so a future
  "re-add tasks to the panel" change fails CI rather than silently
  re-introducing the duplication.

# 2026-06-19 — Editable control/task side panel (evidence + activity tab)

**Commit:** `<sha> feat(controls): editable one-click side panel — evidence upload, activity tab, no blur, no edit button`

The Controls list side panel was a read-only quick-view, and editing happened
in a separate quick-edit Sheet (which dimmed/blurred the table). This turns the
one-click side panel INTO the edit surface.

## What changed

- **One-click → editable panel.** Clicking a control NAME opens `ControlEditPanel`
  (edit form: name / description / category / frequency / owner) in the docked
  `AsidePanel`. Clicking an inline task opens `TaskEditPanel` (title / description
  / type / severity / priority / due date / assignee). Both save in place
  (`PATCH /controls/:id` (+ owner) / `PATCH /tasks/:id` (+ assign)) and refresh
  the list via `queryKeys.controls.all` invalidation.
- **Intent → evidence upload.** The control panel's old "Intent" field is
  replaced by an evidence-upload box (file → `POST /evidence/uploads`, URL →
  `POST /controls/:id/evidence`, list ← `GET /controls/:id/evidence`).
- **Activity tab.** Each panel has a second tab — `PanelActivityFeed` over the
  existing read-only `/{controls|tasks}/:id/activity` audit endpoints. (No new
  model/migration — the control activity backend already existed.)
- **No table blur.** Editing moved off the modal Sheet into the docked
  `AsidePanel` (no overlay). The `Sheet` primitive gained an optional
  `overlayClassName`; the `AsidePanel`'s `<xl` Sheet fallback passes a
  transparent one so the table stays visible there too.
- **Edit button removed.** The `quick-edit` pencil column is gone — the name is
  now the single one-click affordance.

## Files

| File | Role |
| --- | --- |
| `controls/ControlEditPanel.tsx` | **New.** Editable control panel: Details (form + evidence box) / Activity tabs. |
| `controls/TaskEditPanel.tsx` | **New.** Editable task panel: Details (form) / Activity tabs. |
| `controls/PanelActivityFeed.tsx` | **New.** Shared read-only activity feed for the Activity tab. |
| `controls/ControlsClient.tsx` | Render the panels; remove the quick-edit column + `ControlDetailSheet` usage + `sheetControlId`; `handlePanelSaved`. |
| `controls/page.tsx` | Pass `tasks.edit` permission to the client. |
| `ui/sheet.tsx`, `ui/aside-panel.tsx` | Optional `overlayClassName`; AsidePanel passes a no-blur overlay. |
| `controls/ControlQuickView.tsx`, `controls/TaskQuickView.tsx` | **Deleted** (read-only, replaced). |

## Decisions

- **Comments scrapped → Activity tab.** Per the user: controls have no comment
  backend, so rather than build one (new model + migration + RLS + encryption),
  the panel's second tab is the (already-existing) audit activity feed.
- **Evidence cell parity by reuse of endpoints**, not a shared component —
  `AttachedEvidencePanel` only supports risk/asset uploads, so the box calls the
  control evidence endpoints directly (same ones the control detail page uses).
- **`ControlDetailSheet` left in place but unused.** It's now dead on the list
  page, but deleting it would churn ~6 of its own unit/structural tests; it
  remains a valid component (reusable on the detail page). Flagged for a
  follow-up cleanup.

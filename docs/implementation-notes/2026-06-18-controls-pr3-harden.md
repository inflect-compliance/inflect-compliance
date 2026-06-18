# 2026-06-18 — Controls PR-3: test / polish / harden

**Commit:** `<sha>` test(controls): TidalControl interaction ratchet + a11y/keyboard polish

Final PR of the Controls TidalControl-interaction roadmap. Locks the new
interaction and adds the keyboard + a11y polish.

## Harden — interaction ratchet

`tests/guards/controls-quickview-interaction.test.ts` mirrors the Assets
`item-27-32-34-asset-ux` lock for Controls, asserting the full contract so it
can't silently regress:
- title cell is a `<button>` opening the quick-view (not a nav link) +
  `data-testid` `control-title-…`;
- row selection stays on (single-click selects);
- `onRowClick → /controls/:id` (double-click navigates);
- both `ControlQuickView` + `TaskQuickView` mount; tasks open the task
  quick-view (`onTaskClick={setSelectedTask}`);
- the quick-view surfaces in the responsive `AsidePanel` (`openOnMount` +
  `onClose`), and the primitive exposes those props;
- Escape closes the quick-view;
- the quick-views are accessible regions with a full-view link + close.

This complements the existing earlier guards adjusted in PR-1/PR-2
(`controls-row-expansion`, `b2-table-unification`).

## Polish

- **Keyboard:** `useKeyboardShortcut(['Escape'], closeQuickView)` closes the
  quick-view on the docked rail (≥xl). Below `xl` the Sheet owns Escape
  natively (the global-scope hook is skipped while an overlay is mounted) and
  its dismiss already fires `onClose → closeQuickView` — no double-handling.
- **a11y:** `ControlQuickView` / `TaskQuickView` wrappers are `role="region"`
  with an `aria-label` so screen-reader users can navigate to the panel; the
  close (`aria-label="Close quick view"`) and back affordances were already
  labelled.

## Files

| File | Role |
| --- | --- |
| `…/controls/ControlsClient.tsx` | Escape-to-close (`useKeyboardShortcut`) |
| `…/controls/ControlQuickView.tsx` / `TaskQuickView.tsx` | `role="region"` + label |
| `tests/guards/controls-quickview-interaction.test.ts` | the interaction ratchet |
| `tests/rendered/control-task-quickview.test.tsx` | + region-role assertions |

## Roadmap recap (3 PRs)

1. DataTable row-expansion + inline task nesting (Tidal chevron).
2. Name→quick-view side panel (Assets click pattern) + task quick-view.
3. Test/polish/harden (this PR): interaction ratchet + Escape + a11y regions.

Every step kept the shared DataTable default-off / desktop-safe and shipped a
ratchet + impl note. Two waves of test reconciliation (guards in PR-2, E2E in
PR-2) updated specs that encoded the *old* (navigate-on-name) behaviour to the
new pattern.

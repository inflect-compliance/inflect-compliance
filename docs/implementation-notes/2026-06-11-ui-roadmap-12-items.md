# 2026-06-11 — UI roadmap (12 items)

A 12-item UI-polish roadmap, shipped across 10 PRs (one capstone). Each item
landed with a per-item structural ratchet; the capstone
(`tests/guards/ui-roadmap-2026-06-capstone.test.ts`) guards those guards and
locks the end-of-roadmap audit-polish fixes.

## Items → PRs

| Item | What | PR |
|------|------|----|
| 21 | `code` column off by default (Asset/Risk/Control gear opt-in) | tables |
| 14a | Owner column name-only via `ownerDisplayName` (no email) | tables |
| 2/3 | Entity-table tags `size="sm"` (match control detail) | tables |
| 22 | Tasks bulk **Assign** → `UserCombobox` people-picker (was raw User-ID input) | action-row |
| 23 | Selection toolbar thin brand lower border | action-row |
| 15 | Removed dashboard notif button + controls "Frameworks" button | chrome |
| 18 | Evidence `+Evidence` unified onto the Upload-a-file modal | chrome |
| 24 | Setup wizard: `text-content-inverted`→`emphasis` on light surfaces | wizard |
| 20 | Canonical tooltips on the column/filter gear buttons | tooltips |
| 13 | Controls Browse rail expand-all → chevron toggle (down/left) | rightrail |
| 11 | Subtler create-button gradient (`--btn-gradient-primary`) | gradient |
| 14b | First/last name capture on the profile page | name-capture |

## Decisions

- **`ownerDisplayName(name, email)`** (`src/lib/owner-display.ts`) is the single
  owner/assignee display rule: name, else the email **local-part** as a
  username, never the full address. The capstone audit extended it to the
  Policies + Findings columns (the original item named only Asset/Risk/Control/
  Task).

- **14b without a schema change.** `User.name` is a single encrypted field used
  everywhere; first + last compose into it (`composeDisplayName`) rather than
  adding `firstName`/`lastName` columns + an encrypted-field-manifest change.
  The owner columns (DB-read) reflect a new name immediately; the top-bar
  (JWT claim) refreshes on next sign-in.

- **Item 20 — Tooltip on a Popover trigger.** Naively wrapping the trigger in
  `<Tooltip>` swallowed Radix `Popover.Trigger.asChild`'s injected `onClick`
  (the documented "gear doesn't open" bug). The fix is a `triggerTooltip` prop
  on the Popover that nests **Tooltip OUTER → Popover.Trigger INNER → button**:
  the inner Trigger's Slot keeps the open click on the button while the tooltip
  hover merges through it. Order matters — the reverse nesting is the bug.
  Proven by `tests/rendered/popover-trigger-tooltip.test.tsx` (the popover opens
  WITH a trigger tooltip set). This is the canonical way to put a tooltip on any
  popover/dialog trigger.

- **Item 11 gradient.** `--btn-gradient-primary` held brand to 60% then ramped
  to a dark blue at the far corner. Now brand holds the first half (50%) and
  ramps to a lighter cool tail in both themes — token name unchanged, so the
  B10 contrast guard + all consumers are intact.

# 2026-06-19 — Dropdown option truncation, second wave

**Commit:** `<sha> fix(ui): stop truncating option labels in command palettes, org switcher, notifications`

The canonical rule (PR #1119): **no dropdown truncates an OPTION NAME** — option
labels wrap (`break-words`), never `truncate`/`text-ellipsis`/`line-clamp`/
`whitespace-nowrap`. Triggers (chrome showing the selected value) may still
truncate.

#1119 fixed 8 surfaces but missed several selectable option lists; the user
still saw truncated options. An audit found the gaps:

| Surface | File | Was | Now |
| --- | --- | --- | --- |
| Command palette (⌘K) — nav/action items, entity search results, shortcut descriptions, recent items | `command-palette/command-palette.tsx` | `truncate` | `break-words` |
| Canvas command palette (`/` on the process canvas) — command label + description | `processes/CanvasCommandPalette.tsx` | `truncate` | `break-words` |
| Org / workspace switcher — org + workspace option rows (slug + role) | `layout/org-workspace-switcher.tsx` | `truncate` | `break-words` (trigger keeps `max-w-trunc-tight truncate`) |
| Notifications bell — notification title | `layout/notifications-bell.tsx` | `truncate` | `break-words` |

Locked by new describe blocks in `tests/guards/dropdowns-no-option-truncation.test.ts`.

## Decisions

- **`min-w-0 flex-1 break-words`** on labels inside `flex justify-between` rows
  (palette items, notification title) so the label wraps without shoving the
  trailing chrome (shortcut keys / timestamp / category).
- **Org/workspace switcher** mirrors the already-fixed sibling `tenant-switcher`
  — option rows wrap, the current-context trigger keeps its `truncate` (chrome).
- **Left truncating, deliberately:**
  - The notification *message* body keeps `line-clamp-2` — it's a multi-line
    preview of body content, not an option *name*; clamping a preview is the
    intended pattern (email-style), and #1119's scope is the option label.
  - The **user-menu** header (display name / email) keeps `truncate` — it's
    identity *chrome* (the menu's "trigger" equivalent), not a selectable
    option. The menu's actual items render via the already-covered
    `Popover.Item`.

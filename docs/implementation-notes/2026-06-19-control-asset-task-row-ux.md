# 2026-06-19 — Asset/Control name cursor + control task-row interaction & metadata

**Commit:** `<sha> fix(controls,assets): hand cursor on names, reliable task→rail, enriched inline task rows`

Three reported issues in the Asset/Control tables:

## 1. Hand cursor on the name

Risk renders its title as a `<Link>` (`<a href>`), which the browser gives the
pointer cursor for free. Asset and Control render the name as a `<button>` (it
opens the quick-view), and a `<button>` defaults to the **arrow** cursor. Added
`cursor-pointer` to both name buttons so the affordance matches Risk.

## 2. Clicking a task in the control table didn't open the right rail

Two fixes:

- **Whole-row click.** Previously only the task *title* was the button; clicking
  the status/owner area did nothing. The entire task row is now the button.
- **`AsidePanel` key (the real bug).** The quick-view `AsidePanel` shares its
  tree position **and** `surfaceKey` with the browse-stack panel, so React
  reused the instance in place when switching browse→quick-view (or
  control→task). `openOnMount` is a mount-only effect, so it never re-fired —
  and a persisted-collapsed rail stayed collapsed, silently swallowing the
  task click. Distinct `key="qv-task"` / `key="qv-control"` force a fresh mount
  each time → `openOnMount` fires → the rail opens.

## 3. Inline task rows show category / status / owner / evidence

Each expanded task row now shows: **category** (inherited from the parent
control — tasks have none of their own), the task's **owner** (assignee),
**evidence** count, and **status**. These are **display-only** — the list
filter targets controls, not the nested task sub-rows, so no filter dimensions
were added (per the requirement that only the control's components are
filterable).

To surface evidence, `taskListSelect` (WorkItemRepository) gained
`_count: { select: { evidence: true } }` — one correlated subquery, justified
now that the inline rows read it (the three previously-removed `_count`s
stay removed).

## Files

| File | Change |
| --- | --- |
| `assets/AssetsClient.tsx` | `cursor-pointer` on the name button. |
| `controls/ControlsClient.tsx` | `cursor-pointer` on the name button; distinct `key`s on the quick-view AsidePanels; pass `controlCategory` to `ControlTaskRows`. |
| `controls/ControlTaskRows.tsx` | Whole-row clickable button (`cursor-pointer`); inline category/owner/evidence/status; `_count.evidence` on the type. |
| `repositories/WorkItemRepository.ts` | `taskListSelect` adds `_count.evidence`. |
| `tests/guards/controls-quickview-interaction.test.ts`, `tests/guards/item-27-32-34-asset-ux.test.ts`, `tests/rendered/control-task-quickview.test.tsx` | Lock cursor, AsidePanel keys, whole-row click, inline metadata. |

## Decisions

- **`AsidePanel` keys over reworking `openOnMount`.** Keying the element is the
  idiomatic React way to force a remount; changing `openOnMount` to a
  prop-driven effect would risk re-opening a rail the user deliberately
  collapsed mid-session.
- **Category is shown per task even though it's identical across a control's
  tasks** — the requirement explicitly asked for it inline, inherited.
- **Evidence count added to the shared `taskListSelect`**, not a control-only
  branch — the main tasks list ignores the extra field, and a single
  conditionally-shaped select would be more fragile than one extra subquery.

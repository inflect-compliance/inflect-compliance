# 2026-06-08 — Automation Epic 3: Visual Rule Builder

**Commit:** `<sha>` feat(automation): Epic 3 — visual rule builder modal

The no-code rule creation flow — the single largest gap vs Archer's GUI
workflow designer. A three-step Modal that configures a rule without JSON.

## Design

```
RulesTab "+ Rule" / RuleDetailSheet "Edit" → RuleBuilderModal
  Step 1 Trigger:    name + event Combobox (grouped by domain, from EVENT_LABELS)
  Step 2 Conditions: field = value rows (fields from filterFieldsForEvent)
  Step 3 Action:     RadioGroup(4 types) + typed sub-form
                       NOTIFY_USER  → UserCombobox(multi) + message
                       CREATE_TASK  → title (+severity/priority)
                       UPDATE_STATUS→ toStatus
                       WEBHOOK      → url (+method)
  Save → POST (create) / PUT (edit) → revalidate list cache
```

`src/lib/automation/event-labels.ts` is the metadata layer: per-event label,
description, domain group, and filterable fields. It imports event NAMES from
the `events` leaf — never the `@/app-layer/automation` barrel (which would
drag server-only OpenTelemetry into this client-bundled module).

## Files

| File | Role |
|------|------|
| `src/components/processes/RuleBuilderModal.tsx` | NEW — 3-step builder |
| `src/lib/automation/event-labels.ts` | NEW — event metadata + grouping + filter-field lookup |
| `src/app/t/[tenantSlug]/(app)/processes/RulesTab.tsx` | MODIFY — "+ Rule" toolbar button + edit-from-sheet wiring |

## Decisions

- **Equality-only conditions at Epic 3.** The Epic 1 `triggerFilter` schema is
  a flat `Record<string, value>` equality map, so Step 2 serialises
  `field = value`. Operators (`gt`/`contains`/…) and AND/OR groups are
  explicitly Epic 4's job — building operator UI now would persist data the
  current schema can't represent. Step 2 shows a note to that effect.
- **Server Zod is authoritative.** The modal does light client gating
  (Next/Save enable) but the `automation.schemas.ts` superRefine
  (action-config ↔ actionType agreement) is the real guard; the API rejects
  a malformed rule regardless of the UI.
- **`forceDropdown` on every Combobox/UserCombobox.** Inside a Modal the
  mobile drawer variant would nest a drawer in a dialog — `forceDropdown`
  keeps the desktop popover.
- **"+ Rule" follows the action-button vocabulary** — `icon={<Plus/>}` + bare
  noun "Rule", in the toolbar-primary slot (not the page header).
- **Edit reuses the same modal** via `editRule` (PUT vs POST) — the
  RuleDetailSheet's Epic-2 `onEdit` seam now resolves to this.

## Testing

Builder feel (step nav, portal'd Combobox) is impractical to assert in jsdom;
coverage is the event-labels unit test, the action-config Zod discrimination
(Epic 1 schema test), and a structural ratchet locking the 3-step Modal +
primitive composition + POST/PUT wiring + the leaf-import boundary.

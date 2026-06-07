# 2026-06-08 — Automation Epic 2: Rule Detail Sheet & Toggle

**Commit:** `<sha>` feat(automation): Epic 2 — rule detail sheet + enable/disable toggle

Adds the inline inspect-and-edit panel for a single rule — the slide-out
detail Archer opens from its workflow list.

## Design

```
RulesTab row click → RuleDetailSheet (<Sheet>)
  ├── enable/disable Switch  ─┐
  ├── priority NumberStepper ─┴─ useTenantMutation (optimistic) → PATCH /automation/rules/[id]
  ├── trigger summary card
  ├── action summary card
  └── execution mini-log (placeholder → Epic 6)
```

`PATCH` routes status → `toggleAutomationRule` (refuses ARCHIVED) and priority
→ `updateAutomationRule`. The toggle optimistically patches the rule's row in
the list SWR cache; SWR rolls back on error.

## Files

| File | Role |
|------|------|
| `src/components/processes/RuleDetailSheet.tsx` | NEW — Sheet panel, optimistic toggle + priority |
| `src/app-layer/automation/AutomationRuleRepository.ts` | MODIFY — `toggle()` convenience, refuses ARCHIVED |
| `src/app-layer/usecases/automation-rules.ts` | MODIFY — `toggleAutomationRule` (manage-gated, audited) |
| `src/app/api/t/[tenantSlug]/automation/rules/[id]/route.ts` | MODIFY — PATCH (status/priority) |
| `src/app/t/[tenantSlug]/(app)/processes/RulesTab.tsx` | MODIFY — row click opens the sheet |

## Decisions

- **A dedicated `PATCH` for quick edits**, separate from `PUT` (full
  reconfigure). The sheet only flips status / nudges priority — a narrow
  schema (`{ status?, priority? }`) keeps the optimistic path simple and
  can't accidentally rewrite trigger/action.
- **`toggle()` refuses ARCHIVED.** Archived is terminal soft-delete;
  resurrection needs an explicit un-archive flow, not a status switch. The
  repo returns null → the usecase throws notFound → the Switch is disabled
  for archived rules anyway (defence in depth).
- **Optimistic against the LIST cache, not a detail cache.** The sheet's
  data comes from the row the list already holds, so the toggle patches the
  list array in place — no extra detail fetch, and the list badge stays in
  sync instantly.
- **Edit button is a seam for Epic 3.** It calls an optional `onEdit` that
  Epic 3 wires to the builder modal; until then it's only rendered when a
  handler is supplied.

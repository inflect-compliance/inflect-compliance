# 2026-07-18 — Automation rule-builder completeness

**Commit:** `<sha>` feat(automation): detail-sheet config display + builder as executor superset

## Design

The builder collected rich config but it was write-only, and it exposed fewer
actions than the executor. Two gaps closed.

1. **Detail sheet shows the full config.** `RuleDetailSheet` only rendered
   enable/priority/trigger/action-label; schedule, else-branch, the
   stuck-execution timeout + breach action, chain/next-rule, UPDATE_STATUS
   entity+status, CREATE_TASK severity/priority/assignee/link-entity, and
   WEBHOOK method/headers/secret were invisible after creation. The sheet now
   fetches the full rule detail (`GET /automation/rules/{id}` — the same
   `RuleDetail` shape the builder hydrates from) and renders a read-only
   **Configuration** card: trigger filter, per-action config, schedule,
   stuck-execution timeout, and chain (next/else rules resolved to names). All
   labels localized (`processes.ruleDetail.*`); rows omitted when empty.

2. **Builder is now a superset of the executor.** The executor + Zod already
   supported these; the tabular builder didn't author them:
   - **INVOKE_SUBFLOW** added to the action picker (config: `targetGroupId`).
   - **WEBHOOK** gains `headers` (a `Name: value`-per-line textarea parsed to a
     record) + `secretRef` (HMAC signing) inputs.
   - **CREATE_TASK** gains `linkEntityType` + `linkEntityIdField` so a spawned
     task links back to its source entity.
   - `slaBreachAction` stays constrained to the server-implemented options.

   All new fields thread through `BuilderState`/`EMPTY`/`buildActionConfig`/
   `detailToBuilderState`, so they hydrate on edit and round-trip on save (the
   PR1 no-op-save round-trip test gains cases for headers/secretRef, task
   link-entity, and INVOKE_SUBFLOW).

## Files

| File | Role |
|------|------|
| `src/components/processes/RuleDetailSheet.tsx` | fetch full detail + read-only Configuration card |
| `src/components/processes/RuleBuilderModal.tsx` | INVOKE_SUBFLOW action; webhook headers/secretRef; task link-entity; `parseHeaders`/`stringifyHeaders` |
| `messages/{en,bg}.json` | builder + detail-sheet labels |
| `tests/unit/automation-rule-builder-roundtrip.test.ts` | round-trip cases for the new superset fields |

## Decisions

- **Headers as a `Name: value` textarea**, parsed to a `Record<string,string>`
  on save and re-serialized on hydrate — the simplest authorable form in a
  tabular builder that still round-trips exactly.
- **`targetGroupId` / `linkEntityType` as free-text inputs** rather than
  pickers — the values are node keys / entity-type identifiers the executor
  reads verbatim; a picker is a follow-up nicety, not required for authorability.

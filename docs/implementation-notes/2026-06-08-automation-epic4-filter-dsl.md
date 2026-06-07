# 2026-06-08 — Automation Epic 4: Trigger Filter DSL v2

**Commit:** `<sha>` feat(automation): Epic 4 — recursive filter DSL (AND/OR, operators)

Upgrades the flat equality `triggerFilter` to a recursive condition tree
with AND/OR grouping and `eq/neq/in/not_in/gt/lt/contains` operators —
Archer's conditional-routing capability.

## Design

```
FilterGroup { logic: AND|OR, conditions: (FilterCondition | FilterGroup)[] }
FilterCondition { field, operator, value: string|number|boolean|string[] }
```

The evaluator (`filters.ts::matchesFilter`) is **dual-shape**: it narrows by
structure (`isFilterGroup`) and evaluates either the new `FilterGroup`
recursively or the legacy flat map. The builder Step 2 now renders an AND/OR
toggle + per-condition operator select and serialises to `FilterGroup`.

## Files

| File | Role |
|------|------|
| `src/app-layer/automation/types.ts` | NEW DSL types + `isFilterGroup`; `AutomationTriggerFilter = FilterGroup \| LegacyTriggerFilter` |
| `src/app-layer/automation/filters.ts` | recursive evaluator + operators + legacy branch |
| `src/app-layer/automation/index.ts` | barrel re-exports the new types + `isFilterGroup` |
| `src/app-layer/schemas/automation.schemas.ts` | `TriggerFilter` = recursive FilterGroup `\|` legacy flat (z.lazy) |
| `src/components/processes/RuleBuilderModal.tsx` | Step 2 operators + AND/OR toggle |

## Decisions

- **No data migration — the evaluator's legacy branch IS the migration.**
  The roadmap proposed converting every `triggerFilterJson` flat object to a
  `FilterGroup`. But a migration that doesn't auto-run in the deploy pipeline
  is a footgun (cf. GAP-21), and the dual-shape evaluator already makes
  pre-Epic-4 rows fire correctly. A test proves legacy rows still evaluate;
  new rules write `FilterGroup`. If a cosmetic normalisation is ever wanted,
  it's a safe offline script — never a correctness dependency.
- **Fail-closed on unknown fields, for every operator.** A condition on a
  field absent from the payload never matches (preserves the v1 contract) —
  a typo can't silently fire on everything.
- **Empty group matches.** AND/OR over `[]` both return true so an
  in-progress builder group never blocks a fire.
- **`in`/`not_in` take a comma-separated value set in the UI**, split to a
  `string[]` at serialise time; numeric `gt`/`lt` coerce.

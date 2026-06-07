# 2026-06-08 — Automation Epic 7: Multi-Step Chained Rules

**Commit:** `<sha>` feat(automation): Epic 7 — sequential rule chains

A rule can name a `nextRule` to fire after it succeeds (optionally after a
delay) — modelling real GRC procedures ("RISK_CREATED → create task → notify
owner") without manually wiring 3 separate rules.

## Design

```
AutomationRule.nextRuleId / nextRuleDelay (self-relation "RuleChain")
AutomationExecution.parentExecutionId (lineage)

dispatcher: on a rule's execution SUCCEEDED + nextRuleId set
   → enqueue rule-chain-dispatch (delay = nextRuleDelay*60s)
rule-chain-dispatch: create linked execution (parentExecutionId, triggeredBy
   'chain') → if THAT rule chains onward, enqueue next (depth+1)
```

Two cycle defences:
- **Create-time DFS** (`followChainHasCycle`, pure + unit-tested) — the
  update usecase walks the chain from the proposed `nextRuleId`; if it loops
  back to the rule being edited (or revisits a node) it throws `badRequest`.
- **Runtime depth cap** (`MAX_CHAIN_DEPTH = 10`) in the chain job — a backstop
  if a cycle ever slips past the create guard.

## Files

| File | Role |
|------|------|
| `prisma/schema/automation.prisma` + migration | chain fields + lineage + self-relation FK |
| `src/app-layer/jobs/rule-chain-dispatch.ts` | NEW — chain step job |
| `src/app-layer/jobs/automation-event-dispatch.ts` | enqueue next rule on success |
| `src/app-layer/jobs/types.ts` + `executor-registry.ts` | payload + registration |
| `src/app-layer/usecases/automation-rules.ts` | `followChainHasCycle` + update cycle guard |
| `src/app-layer/automation/{types,AutomationRuleRepository}.ts` | chain input + persistence (relation connect/disconnect) |
| `src/app-layer/schemas/automation.schemas.ts` + routes | chain fields |
| `src/components/processes/RuleBuilderModal.tsx` | "Chain to next rule" Combobox + delay |

## Decisions

- **Chaining fires on a recorded SUCCEEDED**, consistent with the foundation's
  record-intent model (action handlers are still stubbed) — the chain
  pipeline is fully observable now; real action execution plugs in later.
- **`triggeredBy: 'chain'`** distinguishes chained executions in the history;
  `parentExecutionId` gives the lineage for an audit trail / future viewer.
- **Cycle guard is two-layered** (create-time DFS + runtime depth cap) — the
  DFS gives a clean user error; the cap guarantees termination regardless.
- **`RuleChainViewer` diagram deferred.** The builder configures chains and
  the lineage is persisted; a dedicated sequence-diagram component is pure
  visualization and is the lowest-value slice — deferred to keep the epic
  tight. Noted as a follow-up.

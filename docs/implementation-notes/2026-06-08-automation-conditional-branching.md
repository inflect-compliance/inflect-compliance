# 2026-06-08 — Real Conditional Branching in the Chain Engine (PR-F, Audit Cycle 2)

**Commit:** `<sha>` feat(automation): conditional branching — make canvas condition edges executable

## Why

The cycle-2 audit found the canvas's condition nodes + `condition-pass`/
`condition-fail` edges (VR-5) were **pure decoration**: the execution engine
only chained linearly via `nextRuleId`, and `canvas-rule-sync` materialized
*only* `chain-delay` edges. A user could draw "if CRITICAL → escalate, else →
log", save it, and the engine would run neither branch correctly.

## What

The branch decision lives at the **chained rule's filter**, evaluated at run
time:

- **Schema** — `AutomationRule.elseRuleId` (+ `RuleElseChain` self-relation +
  index + migration): the fail/else chain target.
- **`rule-chain-dispatch`** — before running a chained rule, evaluates its own
  `triggerFilter` against the payload:
  - **match (pass)** → run the action, record `SUCCEEDED`, follow `nextRuleId`;
  - **miss (else)** → skip the action, record `SKIPPED` (`outcomeJson.branch =
    'else'`), follow `elseRuleId`.
  (Previously the chained rule's filter was never re-checked — it always ran.)
- **`canvas-rule-sync`** — now materializes the condition edges:
  `condition-pass` → `nextRuleId`, `condition-fail` → `elseRuleId`,
  `chain-delay` → `nextRuleId` (+delay). The invariant holds — only ids cross to
  the rule, never node logic.

## Ratchet + tests

`automation-conditional-branching.test.ts` locks the three wirings (schema else
branch, dispatcher fork + SKIPPED, sync materialization). Dispatcher unit tests
prove PASS (matching filter → action runs → `nextRuleId`) and ELSE (non-matching
→ skipped → `elseRuleId`); sync test proves `condition-fail` → `elseRuleId`.
Backward-compatible: a chained rule with no filter matches → pass path (the
prior behaviour).

## Decision

- **The branch condition is the chained rule's own filter** (not a separate
  condition object) — fits the action-node-owns-rule model (VR-3) where a
  condition node feeds the downstream action rule, and reuses the existing
  `matchesFilter` evaluator with zero new DSL.
- Cycle safety: the runtime `MAX_CHAIN_DEPTH=10` backstop bounds any loop formed
  via `elseRuleId` (the create-time DFS guard covers `nextRuleId`; extending it
  to the else edge is a small follow-up).

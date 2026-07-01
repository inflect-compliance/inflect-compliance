# 2026-07-01 — Agentic workflow engine (orchestration foundation)

**Commit:** `feat(agentic): compliance workflow engine (orchestration foundation)`

## Design

The MCP server (foundation + read tools + propose-not-commit writes + approval
queue) gave external agents scoped, audited, human-gated access to IC's data.
This adds the **orchestration** layer that runs multi-step agent workflows using
those tools.

**The load-bearing property: multi-step ≠ multi-privilege.** An agentic workflow
does many steps, some of which propose writes. Every write STILL routes through
the propose-not-commit approval queue (`runProposeTool` → `createAgentProposal`).
The engine can commit nothing a single MCP tool couldn't — it adds
orchestration + checkpoints + guardrails, **not new authority**.

```
startWorkflowRun(mcp:orchestrate | write)
  → executor loop over the WorkflowDefinition steps (same tenant/RLS/permission ctx):
      READ            → runReadTool(ctx, tool, args)      [gather context]
      PROPOSE         → runProposeTool(ctx, tool, items)  [queue proposal — never commits]
      HUMAN_CHECKPOINT→ status = AWAITING_APPROVAL, PAUSE  [wait for a human]
      SYNTHESIS       → def.synthesize(context)           [reason over accumulated context]
  → every step: append-only WorkflowStep row + hash-chained audit (agent attribution)
  → guardrails: MAX_STEPS / MAX_TOKENS / WALL_CLOCK_MS; abort/pause between steps
  → COMPLETED (summary = last synthesis) | AWAITING_APPROVAL | FAILED | ABORTED
```

A run executes synchronously until it completes or hits a HUMAN_CHECKPOINT,
where it PAUSES to `AWAITING_APPROVAL`. A human reviews the queued proposals
(the existing `/agent-proposals` queue), then `resumeWorkflowRun` continues from
the next step. The agent orchestrates the WORK; humans gate every WRITE and
every material decision.

### AISVS C9 (Orchestration & Agentic Security)

- **C9.1 (tool-call governance)** — every step reuses the MCP tools'
  authentication, scope, RLS, permission, and audit; the engine adds no tool
  authority. Per-run step / token / wall-clock caps bound a runaway run.
- **C9.2.1 (block privileged actions until human approval)** — a workflow
  CANNOT silently complete a mutation: PROPOSE steps queue proposals, and a
  HUMAN_CHECKPOINT blocks until a human acts. A failed step leaves nothing
  half-applied — writes are proposals, so nothing is half-committed by design.
- **C9.3 (tenant isolation)** — the executor runs every tool call in
  `runInTenantContext`; RLS makes cross-tenant orchestration impossible.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/{compliance,enums,auth}.prisma` | `WorkflowRun` / `WorkflowStep` models + status/kind enums + Tenant relation |
| `prisma/migrations/20260701150000_agentic_workflow_engine/migration.sql` | tables + indexes + RLS policies |
| `src/lib/security/encrypted-fields.ts` | `WorkflowRun.{contextJson,summary}` + `WorkflowStep.{inputJson,outputJson}` encrypted |
| `src/lib/agentic/workflow-types.ts` | the declarative `WorkflowDefinition` contract + `ENGINE_CAPS` |
| `src/lib/agentic/workflow-registry.ts` | the registry (1A: a trivial `diagnostic` workflow) |
| `src/app-layer/usecases/workflow-runs.ts` | the engine: start / resume / abort / list / get + executor |
| `src/lib/mcp/auth.ts` | `enforceMcpCapability` widened to `orchestrate` |
| `src/lib/auth/api-key-auth.ts` | `mcp:orchestrate` capability scope |
| `src/app/api/t/[tenantSlug]/agent-runs/**` | start / list / get / resume / abort routes |
| `src/app/t/[tenantSlug]/(app)/agent-runs/**` | the run observability page |
| `tests/guardrails/agentic-engine-coverage.test.ts` | the multi-step propose-not-commit lock + guardrails |
| `tests/integration/agentic-engine.test.ts` | real-DB: a run completes with an audited trail; a PROPOSE run pauses at its checkpoint; abort stops cleanly |

## Decisions

- **Declarative workflows, one engine.** A workflow is a data structure (a step
  list); the engine is the only thing that runs steps. 1B adds the real
  framework-onboarding / audit-prep definitions to the same registry — no
  bespoke orchestration.
- **Synchronous-until-checkpoint.** Steps are fast (DB reads + proposal writes,
  no in-engine LLM call — SYNTHESIS is a deterministic function over gathered
  context). Running synchronously until a checkpoint keeps the model simple and
  fully testable; a background/queued executor is a future option if steps ever
  grow long.
- **`mcp:orchestrate` > `mcp:propose`.** Starting a run is strictly more
  privileged than proposing a single write (a run can queue many). API-key
  callers need `mcp:orchestrate`; human callers need write permission.
- **Security review required before merge** — an autonomous multi-step agent
  surface.

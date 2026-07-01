# 2026-07-01 — Framework-onboarding + audit-prep workflows

**Commit:** `feat(agentic): framework-onboarding + audit-prep workflows`

## Design

The first real workflows on the agentic engine (2026-07-01-agentic-workflow-engine).
**No new engine / tool / auth — just workflow DEFINITIONS.** A workflow is a
declarative `WorkflowDefinition` (a step list) the SAME engine runs; these two
prove it end-to-end.

### Workflow A — "Framework onboarding" (`framework-onboarding`)

```
READ get_tenant_context + get_framework_status
  → READ find_coverage_gaps (the newly-installed framework)
  → PROPOSE propose_controls (one per uncovered requirement, ≤20)
  → HUMAN_CHECKPOINT (review + approve the proposed control set)
  → SYNTHESIS ("proposed N controls, M gaps remain needing evidence")
```

Turns "you installed a framework, now stare at 40 empty requirements" into
"here's a proposed starting control set, approve it."

### Workflow B — "Audit prep" (`audit-prep`)

```
READ get_framework_status + find_coverage_gaps + list_evidence_expiring + list_findings
  → SYNTHESIS (readiness: coverage %, gaps, stale evidence, open findings)
  → PROPOSE propose_finding (per material gap) + draft_policy (a policy scaffold)
  → HUMAN_CHECKPOINT (review the audit-prep pack)
  → SYNTHESIS (audit-readiness report + a prioritised punch-list)
```

Turns weeks of manual audit prep into an agent-assembled readiness pack the
human refines.

### The checkpoint-before-completion rule

Both write-workflows PROPOSE (never commit) and carry a HUMAN_CHECKPOINT before
their final synthesis. The `canned-workflows-coverage` ratchet enforces it: any
workflow with a PROPOSE step MUST have a HUMAN_CHECKPOINT (no fully-autonomous
mutation), and every step must name a real MCP tool.

### The output artifact

Each completed run's final SYNTHESIS text becomes `WorkflowRun.summary` — a
durable, shareable deliverable (the onboarding summary / audit-readiness report)
linked to the run, not a transient chat. The `/agent-runs` page renders it.

## Files

| File | Role |
| --- | --- |
| `src/lib/agentic/workflows/framework-onboarding.ts` | Workflow A definition (pure data) |
| `src/lib/agentic/workflows/audit-prep.ts` | Workflow B definition (pure data) |
| `src/lib/agentic/workflow-registry.ts` | registers both alongside `diagnostic` |
| `tests/guardrails/canned-workflows-coverage.test.ts` | declarative + real-tool + checkpoint-before-completion lock |
| `tests/integration/canned-workflows.test.ts` | Workflow B end-to-end: proposals + readiness report, commits nothing until approval |

## Decisions

- **Pure-data definitions.** The workflow files export a `WorkflowDefinition` and
  import only `workflow-types` — no engine, no usecases (ratchet-enforced). The
  trigger surface (the `/agent-runs` "Start a workflow" buttons) and the run
  observability come free from 1A, which iterates the registry.
- **`buildItems` maps gathered context → proposal items.** Onboarding maps each
  uncovered requirement (`find_coverage_gaps.unmappedRequirements`) to a
  candidate control; audit-prep maps them to candidate findings + drafts a
  policy scaffold. Each item is validated against its create-schema + sanitised
  by `createAgentProposal` at the propose boundary.

## Follow-on

**Tenant-authored custom workflows** — a workflow authoring surface where a
tenant composes their own step sequences — is the natural next PR. This PR ships
the two canned workflows; the engine already runs any registered definition.

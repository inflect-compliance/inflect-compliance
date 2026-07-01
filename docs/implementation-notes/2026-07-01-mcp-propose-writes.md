# 2026-07-01 — MCP propose-not-commit writes + approval queue (Phase 3)

**Commit:** `feat(mcp): propose-not-commit writes + approval queue`

## Design

Phase 3 gives the MCP server WRITE capability — but **the agent never mutates a
record directly.** It PROPOSES; a human approves; then IC's real create-usecase
runs. This is the load-bearing safety property of the whole MCP effort: a
hallucinating or prompt-injected agent cannot create a live compliance record.
It mirrors IC's existing "AI suggests → human accepts" risk-suggestions pattern,
generalised.

```
agent → propose_risks/…(mcp:propose)     [MCP tool — writes a PROPOSAL, never an entity]
      → createAgentProposal               [validate vs create-schema + Epic-D sanitise → PENDING AgentProposal]
      ↳ (queue) …
human → /t/<slug>/agent-proposals         [review queue — full content + rationale, C9.2.2]
      → approve                           [assertCanWrite — a privileged HUMAN action]
      → createRisk/createControl/…         [the REAL create-usecase runs HERE — same validation/audit/cache]
      → AgentProposal.status = ACCEPTED, createdEntityId set, audited USER + agent attribution
```

### The propose-not-commit lock

`tests/guardrails/mcp-propose-coverage.test.ts` — the single most important MCP
ratchet. It asserts the propose tools **never import an entity create/update/
delete usecase** (they only call `createAgentProposal`, the queue), and that the
real `create*` usecases run **only** from the approval usecase. A propose tool
that called `createRisk` directly would fail CI.

### Scope model

Propose tools require the **`mcp:propose`** capability scope — strictly more
privileged than `mcp:read` — PLUS the domain read scope. A read-only key cannot
propose. There is **no `mcp:write` / write-direct scope**: writes are always
proposals.

### The AgentProposal model

A new generic model (NOT a reuse of the risk-specific `RiskSuggestion*`):
`{ kind (RISK|CONTROL|POLICY|FINDING), status (PENDING|ACCEPTED|REJECTED|EDITED),
payloadJson, rationale, proposedViaKeyId, reviewedByUserId, reviewedAt,
createdEntityId }`. Tenant-scoped with **RLS** (migration
`20260701140000_mcp_agent_proposal`), **encrypted at rest** (Epic B —
`payloadJson` + `rationale`), and `@@index([tenantId, status, createdAt])`.

### Boundary controls (AISVS C9 / C10)

The propose tools are where an EXTERNAL agent's output enters IC's write path —
the highest-risk surface.

- **C9.2.1 (block privileged actions until human approval)** — **Met.** The
  propose-not-commit gate; the agent creates only a proposal, a human commits.
- **C9.2.2 (display full action parameters)** — **Met.** The review queue renders
  the proposed content untruncated + the agent's rationale.
- **C10.3 (prompt-injection / malicious output at the boundary)** — **Met.**
  `createAgentProposal` validates every item against the target Zod create-schema
  (malformed → rejected at the boundary, never queued) and sanitises all
  proposed free text with `sanitizePlainText` (Epic D) before it enters the
  queue. The approval path re-runs the real usecase's own sanitisation.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/{compliance,enums,auth}.prisma` | `AgentProposal` model + `AgentProposalKind` enum + Tenant relation |
| `prisma/migrations/20260701140000_mcp_agent_proposal/migration.sql` | table + index + RLS policies |
| `src/lib/security/encrypted-fields.ts` | +`AgentProposal: ['payloadJson', 'rationale']` |
| `src/app-layer/usecases/agent-proposals.ts` | propose / list / approve / reject — the queue + human-approval commit |
| `src/lib/mcp/tools/propose-tools.ts` | the 4 propose tools + `runProposeTool` funnel |
| `src/lib/mcp/auth.ts` | `enforceMcpCapability` (`mcp:read` / `mcp:propose`) |
| `src/app/api/t/[tenantSlug]/agent-proposals/**` | list / approve / reject routes |
| `src/app/t/[tenantSlug]/(app)/agent-proposals/**` | the human review-queue page |
| `tests/guardrails/mcp-propose-coverage.test.ts` | the propose-not-commit lock + scope + boundary + model hardening |
| `tests/integration/mcp-propose.test.ts` | propose→PENDING (no entity), approve→entity created, reject→nothing, malformed refused, cross-tenant, scope, prompt-injection sanitised |

## Decisions

- **New `AgentProposal`, not a `RiskSuggestion*` reuse.** The suggestion model is
  risk-specific (threat/vulnerability/likelihood columns, a single `createdRiskId`
  back-link); it can't represent proposed controls/policies/findings. The generic
  `AgentProposal` dispatches by `kind` to the matching create usecase on approval
  — strictly better than the precedent's direct-`db.risk.create` bypass, because
  it inherits each usecase's validation, sanitisation, cache invalidation, and
  creation audit.
- **Approval re-parses the create-schema.** Even though propose validated it, the
  approval path re-parses (with any human edits merged) so edits can't smuggle an
  invalid record past the schema.
- **Dual attribution without a schema change.** The approval audit is a `USER`
  action (the reviewer); the proposing agent's key id rides `metadataJson`
  (`proposedByApiKeyId`) — no new AuditLog column.
- **Security review required before merge** — the agentic write surface.

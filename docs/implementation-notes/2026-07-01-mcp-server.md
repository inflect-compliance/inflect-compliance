# 2026-07-01 — IC MCP server (Phase 1: foundation + read tool)

**Commit:** `feat(mcp): IC MCP server — agent tenant-inspection (Phase 1 read) + propose-not-commit (Phase 2)`

## Design

IC now exposes a remote **MCP (Model Context Protocol)** server at `/api/mcp`
so external agents (Claude Desktop, other MCP clients) can *inspect* a tenant's
compliance posture. The load-bearing design constraint: **inherit IC's security
model, do not reinvent it.** The MCP server is a thin adapter — every tool and
resource call runs the SAME chain a REST route does:

```
Bearer TenantApiKey
  → verifyApiKey                     (src/lib/auth/api-key-auth.ts — the SAME fn getLegacyCtx uses)
  → RequestContext                   (tenantId, userId=key creator, role, appPermissions, apiKeyId, apiKeyScopes)
  → enforceApiKeyScope(mcp:read)     (capability gate — a REST key can't reach MCP)
  → [per tool] enforceApiKeyScope(<resource>:read)   (a controls-only key can't call a risks tool)
  → existing read usecase            (runInTenantContext RLS + assertCanRead permission, internally)
  → appendAuditEntry(actorType API_KEY)
```

The server **never queries Prisma directly** and **never invents an auth path**.
Cross-tenant isolation is guaranteed by RLS: each usecase transaction binds
`app.tenant_id` from the key's tenant, so a second tenant's key sees only its
own rows — the same guarantee the REST API relies on. This is locked absolutely
by `tests/guardrails/mcp-server-coverage.test.ts` (no MCP source may import
`@/lib/prisma`, a repository, or call `runInTenantContext` itself).

### Why a hand-rolled JSON-RPC handler, not `@modelcontextprotocol/sdk`

The SDK's `StreamableHTTPServerTransport` is built around Node's
`http.IncomingMessage`/`ServerResponse`; Next.js App Router handlers speak the
Web `Request`/`Response` API. Bridging the two is fragile. A small, auditable
JSON-RPC handler (`src/lib/mcp/protocol.ts`) that we fully control keeps every
call on the existing security chain with no hidden transport behaviour — the
"thin adapter" ethos. Read tools produce no server-initiated messages, so every
request gets a single JSON response; the SSE branch of streamable HTTP is
unnecessary.

### Scope model

Two new **capability** scopes on `TenantApiKey` (added to `SCOPE_ACTION_MAP`):
`mcp:read` (Phase 1) and `mcp:propose` (Phase 3, strictly more privileged).
They map to NO PermissionSet flags — they gate MCP *access*, while the key's
**resource** scopes (`risks:read`, `controls:read`, …) gate individual tools.
There is intentionally **no `mcp:write`/write-direct scope**: every MCP write is
a human-approved proposal (Phase 3), never a direct mutation.

### Phasing

- **Phase 1 (this PR):** the foundation — `/api/mcp`, TenantApiKey auth, the
  execution funnel (`runReadTool`), one proof tool (`get_compliance_posture`,
  wrapping `getExecutiveDashboard`), one grounding resource (framework
  catalogue), and the cross-tenant-leak ratchet.
- **Phase 2:** the full read-tool suite (`list_risks`, `find_coverage_gaps`, …).
- **Phase 3:** propose-not-commit write tools + the `AgentProposal` approval
  queue (agent proposes → human approves → the real create-usecase runs).

## Files

| File | Role |
| --- | --- |
| `src/lib/mcp/protocol.ts` | MCP JSON-RPC framing + method dispatch (pure protocol) |
| `src/lib/mcp/auth.ts` | `authenticateMcpRequest` — verifyApiKey + `mcp:read` gate |
| `src/lib/mcp/tools/types.ts` | `McpReadTool` contract (thin wrapper over a usecase) |
| `src/lib/mcp/tools/registry.ts` | `runReadTool` — the single scope→validate→usecase→audit funnel |
| `src/lib/mcp/tools/get-compliance-posture.ts` | Phase-1 proof tool (wraps `getExecutiveDashboard`) |
| `src/lib/mcp/resources.ts` | Framework-catalogue grounding resource |
| `src/app/api/mcp/route.ts` | The `/api/mcp` endpoint (auth → dispatch → JSON) |
| `src/lib/auth/api-key-auth.ts` | +`mcp` capability scopes |
| `tests/guardrails/mcp-server-coverage.test.ts` | The cross-tenant-leak + scope/audit/read-only lock |

## AISVS C9 / C10 applicability

Shipping an MCP server + (Phase 3) an agentic propose/approve flow makes two
OWASP AISVS chapters, previously marked **N/A** in
`docs/security/aisvs-self-assessment.md`, now **APPLICABLE**:

- **C9 — Orchestration & Agentic Security.** External agents now drive IC
  operations. Phase 3's propose-not-commit gate is a direct implementation of
  **C9.2.1 "Block privileged actions until human approval"** (the write path is
  a human-approved proposal, never a silent agent mutation).
- **C10 — MCP Security.** IC now has an MCP surface. Tool authorization
  (per-tool `enforceApiKeyScope` + usecase permission), output scoping (RLS —
  no cross-tenant data), and (Phase 3) input validation/sanitisation of
  agent-proposed content at the write boundary are the controls.

The self-assessment doc is updated to reflect C9/C10 as applicable; the
questionnaire wiring for the new applicability lands with Phase 3.

## Decisions

- **Inherit, don't reinvent.** Every security control (auth, RLS, scope,
  permission, audit, rate limiting via `withApiErrorHandling`) is the existing
  stack wired in — the MCP layer adds none of its own. The ratchet fails CI if
  any tool bypasses the chain.
- **Audit as `API_KEY`.** `logEvent` hard-codes `actorType: 'USER'`; the MCP
  funnel calls `appendAuditEntry` directly with `actorType: 'API_KEY'` + the key
  id in metadata, so M2M invocations are attributable to the agent's key.
- **Security review required before merge** — a multi-tenant agent surface
  warrants explicit sign-off (named in the PR).

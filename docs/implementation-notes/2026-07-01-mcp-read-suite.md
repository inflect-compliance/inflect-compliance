# 2026-07-01 — MCP read-tool suite (Phase 2)

**Commit:** `feat(mcp): read-tool suite (tenant inspection)`

## Design

Phase 2 fills out the MCP server's read surface on the Phase-1 foundation
(`docs/implementation-notes/2026-07-01-mcp-server.md`). It introduces **no new
transport, auth, or security model** — every new tool is a thin wrapper over an
existing read usecase and rides the same funnel:

```
runReadTool → enforceApiKeyScope(<resource>:read) → <usecase>(ctx, args)
            → (usecase: runInTenantContext RLS + assertCanRead) → appendAuditEntry(API_KEY)
```

### The tools (each over an existing usecase)

| Tool | Usecase | Resource scope |
| --- | --- | --- |
| `get_compliance_posture` | `getExecutiveDashboard` | `controls:read` |
| `get_tenant_context` | `getDashboardData` | `controls:read` |
| `list_risks` | `listRisks` (filters + `take`) | `risks:read` |
| `list_controls` | `listControls` (filters + `take`) | `controls:read` |
| `search_controls` | `getUnifiedSearch` (control hits) | `controls:read` |
| `find_coverage_gaps` | `computeCoverage` (unmapped reqs) | `frameworks:read` |
| `get_framework_status` | `computeCoverage` / `listInstallableFrameworks` | `frameworks:read` |
| `list_evidence_expiring` | `listExpiringEvidence` | `evidence:read` |
| `list_findings` | `listFindings` | `audits:read` |
| `list_tasks` | `listTasks` (filters + `take`) | `tasks:read` |

Every tool: validates its arguments against a Zod `argsSchema`
(`additionalProperties:false`), and every list/search tool is **bounded** (a
`limit` — default 50, or `days` for evidence). No unbounded dumps.

### Resources

`resources/list` now returns the framework catalogue **plus one requirement-tree
resource per installable framework** (`inflect://frameworks/<key>/requirements`),
so an agent can ground itself on the requirement structure + this tenant's
coverage without a tool round-trip. Reads ride the `frameworks:read` scope.

## Files

| File | Role |
| --- | --- |
| `src/lib/mcp/tools/risk-tools.ts` | `list_risks` |
| `src/lib/mcp/tools/control-tools.ts` | `list_controls`, `search_controls` |
| `src/lib/mcp/tools/framework-tools.ts` | `find_coverage_gaps`, `get_framework_status` |
| `src/lib/mcp/tools/evidence-tools.ts` | `list_evidence_expiring` |
| `src/lib/mcp/tools/work-tools.ts` | `list_findings`, `list_tasks` |
| `src/lib/mcp/tools/context-tools.ts` | `get_tenant_context` |
| `src/lib/mcp/tools/registry.ts` | +9 tools registered |
| `src/lib/mcp/resources.ts` | dynamic per-framework requirement resources |
| `tests/guardrails/mcp-read-suite-coverage.test.ts` | suite ratchet (usecase-backed, scope-gated, bounded, read-only) |
| `tests/integration/mcp-read-suite.test.ts` | per-tool cross-tenant isolation + scope refusal + bound (real DB) |

## Decisions

- **Thin wrappers, no new machinery.** Each tool maps args → an existing
  usecase and serialises the result. Read filters have no canonical Zod schema
  in the codebase (they're repository interfaces), so each tool defines a Zod
  schema mirroring the interface and casts to the usecase's filter type.
- **Cross-cutting tools use a representative scope.** `get_compliance_posture`
  and `get_tenant_context` span domains; they gate on `controls:read` (controls
  are the compliance core) rather than an optional/no scope, keeping the
  "every tool needs a resource scope" model uniform and the ratchet strong.
- **`search_controls` narrows the unified search.** `getUnifiedSearch` fans out
  over all entity types; the tool returns only the `control` hits to match its
  name + `controls:read` scope.
- **Findings map to `audits:read`.** There is no `findings` API-key scope;
  findings are audit-domain artefacts, so the audits scope gates them.

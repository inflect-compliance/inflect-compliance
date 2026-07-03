# 2026-07-03 — Agent-action receipts (pipelock CORE)

**Commit:** `<pending> feat(mcp): ingest + verify pipelock-signed agent-action receipts`

## Why

AI/MCP agents take consequential actions (read tenant compliance data, propose
writes). Our internal `AuditLog` proves *we* recorded an event tamper-evidently,
but it is self-attested. **pipelock** (github.com/luckyPipewrench/pipelock) is an
external "AI agent firewall for MCP security" daemon that mediates an agent's
tool calls and emits a **mediator-signed Ed25519 receipt** per decision. Ingesting
+ verifying those receipts gives us *externally-verifiable* evidence: an
independent party observed the action and signed it. Signed external receipts
**complement** the internal hash-chain — the chain proves internal integrity, the
receipt proves independent observation. An auditor can verify a receipt without
trusting us at all.

## License / boundary

pipelock's CORE is Apache-2.0; its "fleet" features (incl. the `fleet-receipt`
DSSE envelope) are Elastic-License-2.0. We use **only the Apache-2.0 CORE receipt
format** (`action_record` + top-level `signature` / `signer_key` / chain fields)
and touch **no ELv2 fleet feature**. This is credited in `NOTICE` and locked by
the ratchet (no `pipelock`/`fleet-receipt` npm dependency).

## Native Ed25519 verify (no npm SDK)

pipelock ships a Go CLI + WASM verifier — there is **no TypeScript verifier on
npm**. Rather than add a phantom dependency, we verify natively with Node's
`crypto.verify(null, message, keyObject, signature)` (Node supports ed25519). We
build a `KeyObject` from the raw 32-byte public key by prefixing the fixed
ed25519 SPKI DER header.

## Canonicalization assumption

pipelock's public docs (`docs/guides/receipt-verification.md`) state the signed
content is "SHA-256(canonical JSON of `action_record`)" but do **not** pin the
exact canonical form (key order / whitespace). We implement one documented,
**swappable** canonical form — recursive sorted-key, no-whitespace JSON, hashed
with SHA-256 — behind the single function `canonicalizeActionRecord()` /
`receiptSignedMessage()`. If pipelock publishes an exact spec or conformance
vectors, swap that one function; nothing else changes.

## Trust model

1. Parse the CORE receipt (zod) + bound/scrub `scannedSummary` (reuse the shared
   `redactSensitiveFields` audit redactor + an 8 KB cap) — no raw payloads/secrets
   are ever persisted.
2. Verify the signature against the **configured** trusted key
   (`env.PIPELOCK_PUBLIC_KEY`), *not* the receipt's own `signer_key` (which is only
   cross-checked + recorded). No configured key ⇒ fail closed.
3. **Valid** → append a hash-chained `AuditLog` entry, then persist the receipt
   with `verified:true` + `auditLogId`. **Invalid/absent** → persist
   `verified:false` with **no** `auditLogId` — visible-but-flagged, never trusted,
   never linked.

## strict vs balanced

`PIPELOCK_STRICT_MODE` (default `0`). Balanced = detect+sign (ingest + verify as
evidence, don't block). Strict = the MCP guard seam
(`assertReceiptCoverageIfStrict`) may reject a tool action lacking a valid
verified receipt. Shipped OFF — enabling it before pipelock fronts every agent
would break the MCP surface.

## Files

| File | Role |
|---|---|
| `prisma/schema/automation.prisma` | `AgentActionReceipt` model (tenant-scoped) |
| `prisma/schema/auth.prisma` / `audit.prisma` | back-relations on `Tenant` / `AuditLog` |
| `prisma/migrations/20260703010000_agent_action_receipt/migration.sql` | table + 3 indexes + FKs + canonical RLS triple |
| `src/lib/mcp/receipt-verification.ts` | canonicalize + native Ed25519 verify + scrub + field extraction |
| `src/lib/mcp/strict-receipt-guard.ts` | strict-mode seam (default off) |
| `src/app-layer/usecases/agent-action-receipt.ts` | ingest+verify+link, list, export |
| `src/app/api/t/[tenantSlug]/agent-receipts/route.ts` | ingest (POST) + list (GET) |
| `src/app/api/t/[tenantSlug]/agent-receipts/[id]/export/route.ts` | external-auditor export (GET) |
| `src/app/t/[tenantSlug]/(app)/admin/mcp/agent-receipts/page.tsx` | MCP activity view + "signature verified" badge |
| `src/env.ts` | `PIPELOCK_PUBLIC_KEY` + `PIPELOCK_STRICT_MODE` |
| `deploy/docker-compose.prod.yml` | `pipelock` mediator service (balanced) + runbook |
| `tests/guards/agent-action-receipt.test.ts` | ratchet (signature gate, scrub, indexes, license) |
| `NOTICE` | pipelock Apache-2.0 CORE attribution + ELv2 boundary |

## Decisions

- **Ingest endpoint auth = Bearer TenantApiKey** (via `getTenantCtx`, the same M2M
  path the MCP surface + scanner ingest use) + the receipt's own Ed25519 signature.
  The key authenticates the transport/tenant; the signature authenticates content.
- **Export is honest about scrubbing.** We store only a scrubbed/bounded summary,
  so the export endpoint does NOT claim to reproduce the signed bytes; it hands the
  auditor the `signature` + `signingKeyId` to re-verify against pipelock's own
  `evidence.jsonl` with the pipelock verifier CLI.
- **UI is a server component** rendering a simple row list (not `DataTable`), which
  sidesteps the list-page-shell / raw-table ratchets for a small read-only surface.
- **Only new model is `AgentActionReceipt`.** AuditLog/Evidence/IntegrationConnection
  are reused; the AuditLog gets a back-relation only (no column change).

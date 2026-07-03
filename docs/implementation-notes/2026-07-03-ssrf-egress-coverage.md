# 2026-07-03 — Centralised SSRF egress guard (`safeFetch` + DNS-rebinding re-check)

**Commit:** `<sha> feat(security): route tenant-controlled outbound requests through webhook-safety`

## Design

`src/app-layer/automation/webhook-safety.ts` already blocked private / loopback /
link-local / cloud-metadata hosts and required https, but was imported by only
`action-executor.ts`. The tenant-controlled **audit-stream URL**
(`audit-stream.ts` `defaultPost`) fetched the URL **directly** — a server-side
request-forgery hole (e.g. `http`/`https://169.254.169.254/...` against cloud
metadata). This change centralises every tenant-controlled outbound request
behind one guard.

Two new exports in `webhook-safety.ts`:

- **`assertPublicAddress(rawUrl)`** — the synchronous `checkWebhookUrl`
  structural check PLUS a `dns.lookup(host, { all: true })` with **every**
  resolved A/AAAA re-checked against `isPrivateAddress`. Defeats DNS rebinding
  (a public hostname resolving into private space). Throws `SsrfBlockedError`;
  returns the validated addresses.
- **`safeFetch(url, init)`** — calls `assertPublicAddress`, then **pins** the
  connection to the pre-validated IP(s) via an undici `Agent` whose `connect.lookup`
  returns only those addresses. The original hostname is preserved for TLS SNI +
  certificate validation, so DNS cannot change between the check and the connect
  (TOCTOU). Drop-in for `fetch` on any tenant URL.

## Files

| File | Role |
|------|------|
| `src/app-layer/automation/webhook-safety.ts` | + `assertPublicAddress`, `safeFetch`, `SsrfBlockedError` |
| `src/app-layer/events/audit-stream.ts` | `defaultPost` now uses `safeFetch` (the fixed hole); a blocked URL returns non-retryable 403 |
| `src/app-layer/automation/action-executor.ts` | `fireWebhook` consolidated onto `safeFetch` (was structural check + single-address lookup + bare fetch) |
| `tests/guards/ssrf-egress-coverage.test.ts` | rebinding/metadata unit cases + sink-coverage scan |

## Decisions

- **Delivery-time is the authoritative guard.** `auditStreamUrl` has no code
  setter today (it is set out-of-band on `TenantSecuritySettings`), so there is
  no write path to validate — `safeFetch` at delivery is the enforcement point.
  If a setter is ever added it MUST call `checkWebhookUrl` at save (defence in
  depth); the ratchet's sink list is where that gets registered.
- **Per-call short-lived undici Agent.** Outbound volume is low (batched
  audit-stream deliveries, infrequent webhooks); a per-request pinned Agent with
  a 1 ms keep-alive is simpler and safer than a shared dispatcher that cannot
  know which validated IP set applies to a given URL.
- **Fixed-host outbound is out of scope.** The AI provider calls
  (`ANTHROPIC_API_URL` / `OPENROUTER_API_URL`) are compile-time constants, not
  tenant-derived, so they are not routed through `safeFetch`.
- Blueprint: pipelock's centralised-egress model (Apache-2.0) — see NOTICE.

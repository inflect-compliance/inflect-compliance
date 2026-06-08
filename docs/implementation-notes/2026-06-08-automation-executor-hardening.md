# 2026-06-08 — Automation Executor Hardening & Safety (PR-D, Audit Cycle 2)

**Commit:** `<sha>` feat(automation): harden the action executor (SSRF + status allowlist + dedupe + prefs)

## Why

A second-pass audit of the now-real execution engine found security + integrity
holes in `action-executor.ts`:

- **`UPDATE_STATUS` wrote an arbitrary string to an arbitrary column** — the
  config's `field`/`toStatus` were `z.string().min(1)`, so a rule could set
  `Risk.status = "banana"` or write any field.
- **`WEBHOOK` had no SSRF guard** — `url` was validated only as well-formed, so
  any tenant admin could target `169.254.169.254` (cloud metadata),
  `localhost:6379`, or RFC-1918 hosts: a server-side request-forgery primitive.
- **`CREATE_TASK` didn't dedupe** — an unfiltered rule firing repeatedly created
  a duplicate task every time.
- **`NOTIFY_USER` ignored the tenant notification kill-switch.**

## What

| Fix | Mechanism |
|-----|-----------|
| Status allowlist | `STATUS_ALLOWLIST` (Risk/Task/Control → `status` field + legal target values). Rejects non-status fields and illegal values; the explicit per-entity dispatch already prevented model-name injection. |
| Webhook SSRF | `webhook-safety.ts`: `checkWebhookUrl` (https-only + block localhost/private-literal/`*.internal`/`*.local`/metadata) **then** `dns.lookup` + `isPrivateAddress(resolvedIP)` — defeats a public name pointing at private space. Runs before `fetch`. |
| Task dedupe | deterministic `key = auto:<ruleId>:<entityId>`; skip if a non-terminal task with that key exists. |
| Notify kill-switch | `isNotificationsEnabled(tenant)` gate (mirrors the retention job). |

## Ratchet

`tests/guards/automation-executor-hardening.test.ts` keeps all four guards
present (allowlist, SSRF check-before-fetch, dedupe, kill-switch) + a
`webhook-safety` unit test (private-IP table, scheme/host blocks) + per-guard
behavioural cases in the executor unit test.

## Deferred (noted)

- **Hash-chained `logEvent` audit entry when an action fires** — the audit
  flagged that an automated status change appears only in the
  `AutomationExecution` row, not the immutable audit log. Adding it needs a new
  audit action type + ctx construction; scoped as a follow-up.
- **Webhook retry + per-delivery record** (the schema header references unbuilt
  `Webhook`/`WebhookDelivery` models) — a larger delivery-tracking PR.

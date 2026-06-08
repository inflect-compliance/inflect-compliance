# 2026-06-08 — Automation Trigger Coverage & Catalog Coherence (PR-C)

**Commit:** `<sha>` feat(automation): evidence-expiry trigger events + catalog coherence

## Why

The audit found two trigger-coverage gaps:

1. **Evidence expiry couldn't be a trigger.** The single most automation-worthy
   compliance signal — "evidence is going stale, notify the owner / open a
   remediation task" — had no event at all. The evidence-expiry monitor
   detected expiring/expired evidence but emitted nothing.
2. **Producer/catalog drift.** `emitTestEvidenceLinked/Unlinked` genuinely emit
   `TEST_EVIDENCE_LINKED`/`TEST_EVIDENCE_UNLINKED` via `emitAutomationEvent`, but
   those names were **absent from `AUTOMATION_EVENT_NAMES`** — so the rule
   builder could never subscribe a rule to them. They fired into the void.

## What

- **New events** `EVIDENCE_EXPIRING` / `EVIDENCE_EXPIRED` — added to the catalog
  (`AUTOMATION_EVENTS`), the typed contract union (`event-contracts.ts` +
  `Evidence*Data`), and the builder label map (`EVENT_LABELS`, new `Evidence`
  domain). They are **emitted from the side-effect job**
  (`retention-notifications.ts`, which already creates the reminder tasks/emails
  for expiring evidence) — NOT from `evidence-expiry-monitor.ts`, whose stated
  contract is detection-only / no-side-effects (its unit tests assert that).
  The emit is **best-effort** (`.catch()`) so a bus hiccup never blocks the
  notification job. Idempotent via a per-evidence `stableKey`, so the daily
  re-run dedupes to one execution per evidence + lifecycle stage. Job emission
  only needs `{ tenantId, userId }` — the bus derives the rest.
- **Drift fixed** — `TEST_EVIDENCE_LINKED/UNLINKED` added to the catalog +
  labels (the contracts already had them), so the events the code already emits
  are now subscribable.

## Ratchet

`tests/guards/automation-event-catalog-coherence.test.ts` — scans every
`emitAutomationEvent` call site (excluding the catalog/contract/label
*definition* files) and fails CI if any emitted event name is missing from
`AUTOMATION_EVENT_NAMES`. This is the guard that *caught* the `TEST_EVIDENCE`
drift; it now prevents the whole class (emit a new event, forget the catalog →
red).

## Decisions

- **Idempotent emit via static `stableKey`** (`evidence-expiring-<id>`) — the
  rule fires once when evidence enters the expiring window; the daily monitor
  re-run dedupes at the execution `idempotencyKey` layer rather than spamming.
- Job emission constructs a minimal `{ tenantId, userId }` context (cast to
  `RequestContext`) — the bus only reads those two fields; no need to
  fabricate a full permissions context for a system-initiated event.

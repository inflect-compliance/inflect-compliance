# 2026-06-08 — Automation Epic 6: Execution History & Re-trigger

**Commit:** `<sha>` feat(automation): Epic 6 — execution history + manual re-trigger

The GRC-critical audit trail: a paginated, PII-scrubbed history of every rule
firing, plus a manual re-trigger that replays a rule as a fresh execution.

## Design

```
GET  /automation/rules/[id]/executions  → listRuleExecutions (cursor + status, PII-scrubbed)
POST /automation/rules/[id]/re-trigger  → reTriggerRule (ENABLED guard → targeted dispatch)
RuleDetailSheet → ExecutionsPanel (list + expand error/outcome + Re-trigger)
```

Re-trigger enqueues `automation-event-dispatch` with a new `targetRuleId` +
`triggeredBy` on the payload, so only the one rule fires, recorded as a
`manual` execution. It replays the most recent execution's payload so a
configured filter behaves as it did originally, and uses a unique `stableKey`
so the idempotency guard mints a NEW execution instead of deduping.

## Files

| File | Role |
|------|------|
| `src/app-layer/usecases/automation-executions.ts` | NEW — list (PII scrub) + re-trigger |
| `src/app-layer/automation/AutomationExecutionRepository.ts` | `listForRulePaginated` (cursor) |
| `src/app-layer/jobs/types.ts` + `automation-event-dispatch.ts` | `targetRuleId`/`triggeredBy` on the dispatch payload + honoured in rule selection |
| API `…/executions` + `…/re-trigger` routes | NEW |
| `src/components/processes/ExecutionsPanel.tsx` | NEW — history list + re-trigger |
| `src/components/processes/RuleDetailSheet.tsx` | mounts the panel (replaces the placeholder) |

## Decisions

- **PII scrub is a server-side blocklist** over the snapshotted trigger
  payload (`email/password/secret/token/ssn/apikey`), substring + case-
  insensitive — defence in depth since the payload is producer-shaped.
- **Targeted re-trigger via `targetRuleId`**, not a broadcast of the event —
  re-triggering one rule must not fire every rule subscribed to that event.
  The dispatcher adds one `where` clause; default behaviour is unchanged.
- **Unique `stableKey` per manual fire** so the idempotency dedupe (which
  exists to stop retried events double-firing) doesn't swallow an intentional
  replay.
- **Cursor pagination** (`limit+1` lookahead → `nextCursor`) over offset —
  stable under inserts, matches the platform's list-pagination convention.

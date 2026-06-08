# 2026-06-08 — Automation Action Execution Engine

**Commit:** `<sha>` feat(automation): real action execution engine

## Why

A deep audit of the Workflow Automation + Visual Rule Editor roadmaps found the
engine's central gap: **it executed nothing.** Every matched rule wrote an
`AutomationExecution` row with `note: 'no-op: action handlers register in a
later epic'` and produced zero side effects — no notification, no task, no
status change, no webhook. The plumbing (emit → enqueue → dispatch → filter →
execution row) was production-grade; the action boundary was a universal stub.
This is the exact Archer parity gap (Dimension 4: actions that *execute*).

## What

`src/app-layer/automation/action-executor.ts` — `executeAction(db, rule, event)`
dispatches on `actionType` and produces a real side effect:

| Action | Side effect |
|--------|-------------|
| `NOTIFY_USER` | `Notification` rows for each **tenant-member** recipient (foreign/stale ids dropped — isolation safety) |
| `CREATE_TASK` | a `Task` (severity/priority/assignee/linked control from the event payload) |
| `UPDATE_STATUS` | writes `field = toStatus` on the event's Risk/Task/Control/Issue |
| `WEBHOOK` | a real HMAC-signed (`X-Inflect-Signature`) HTTP POST, 8s timeout |
| `INVOKE_SUBFLOW` | enqueues `subflow-dispatch` |

All three dispatchers (`automation-event-dispatch`, `rule-chain-dispatch`,
`subflow-dispatcher`) now call it; the execution row settles `SUCCEEDED`/`FAILED`
from the result. The event dispatcher holds the row `RUNNING` for the action's
duration, so a slow webhook is now observable by the SLA sweep (closing the
companion finding that SLA breach detection was gated on a state the engine
never produced).

## Decisions

- **`executeAction` never throws** — handler errors return `{ ok: false }` so
  the dispatcher records a clean `FAILED` row with `errorMessage` (a bad webhook
  / missing entity doesn't crash the worker).
- **NOTIFY_USER filters to actual tenant members** (`tenantMembership` lookup)
  — both a tenant-isolation guard and the reason a stale `userId` can't FK-crash
  the insert (the existing integration test's `u-1` placeholder → 0 notified →
  still `SUCCEEDED`).
- **Single-fire webhook signs with `crypto.createHmac` directly** rather than
  the batch-shaped `buildOutboundHeaders` (that module is built for the
  audit-stream's multi-event batch dedupe contract).

## Ratchet

`tests/guards/automation-action-executor-coverage.test.ts` fails CI if: a new
`AutomationActionType` lacks a `case` in the executor, any dispatcher stops
calling `executeAction`, or any dispatcher regresses to the no-op stub note.
Plus a DB-backed integration test that proves an event → rule → **real
`Notification` row** (the proof the audit found missing).

## Follow-ups (designed, separate PRs)

- **B — Visual Editor reachability**: the canvas feature is still dark to users
  (no UI path to AUTOMATION mode; overlay/run-mode/edge-inference are dead code).
- **C — Trigger coverage**: add `EVIDENCE_EXPIRING/EXPIRED` events + emit; fix
  producer/catalog drift.

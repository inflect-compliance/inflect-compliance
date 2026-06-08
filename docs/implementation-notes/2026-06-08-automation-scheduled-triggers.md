# 2026-06-08 — Scheduled / Time-Based Automation Triggers (PR-E, Audit Cycle 2)

**Commit:** `<sha>` feat(automation): scheduled/time-based triggers (SCHEDULE)

## Why

The cycle-2 audit's biggest **functional** Archer-parity gap: every automation
trigger was a domain event; there was no time/schedule trigger. `triggeredBy:
'schedule'` existed as a value but nothing produced it. "Notify 7 days before a
control-exception expires", "30 days before evidence retention lapses", "before
a control test is due" were all impossible.

## What

The single, GRC-shaped time trigger — **DATE_RELATIVE** ("N days before a target
entity's due date"):

- **`SCHEDULE` trigger** — added to the catalog + typed contract + builder label
  (new "Schedule" domain, "On a schedule"). A rule sets `triggerEvent =
  'SCHEDULE'` + `scheduleConfigJson { kind: 'DATE_RELATIVE', target, offsetDays }`
  (settable through the create/update schema → `ProcessMapRepository`-style repo
  persistence; new `scheduleConfigJson` column + migration).
- **`schedule-trigger-sweep`** — a daily cron (07:00 UTC) that, for each enabled
  SCHEDULE rule, finds target entities whose due date is exactly `offsetDays`
  away and enqueues a **targeted** `automation-event-dispatch` (`targetRuleId`,
  `triggeredBy: 'schedule'`) per entity. The rule's action then fires per entity
  (and its filter still gates). A deterministic `stableKey`
  (`sched-<rule>-<entity>-<due-day>`) makes a re-run idempotent.
- **Allowlisted targets** (`SCHEDULE_TARGETS`): `Evidence.retentionUntil`,
  `ControlException.expiresAt`, `ControlTestPlan.nextDueAt` — an explicit
  per-entity switch (no dynamic table/column from config), same safety posture
  as PR-D's UPDATE_STATUS allowlist.

## Tests + ratchet

`dueWindow` (UTC day math) + `parseScheduleConfig` (validation/allowlist) +
the sweep (targeted, idempotent dispatch; invalid-config skip) are unit-tested;
`automation-scheduled-triggers.test.ts` locks the catalog entry, schema,
cron+executor registration, and the target allowlist. Job-registration guards
updated (15 scheduled jobs; the global sweep is exempted from the
executor-tenantId audit — it scopes per `rule.tenantId` in the runner + the
dispatch it enqueues).

## Decisions / deferrals

- **DATE_RELATIVE only** (no raw cron) — it's the GRC-relevant time trigger and
  avoids a cron-expression evaluator + per-tenant timezone handling. A `kind`
  discriminator leaves room for `CRON` later.
- **Daily sweep, not minute-level** — the targets are day-granularity due dates;
  a daily 07:00 sweep + the idempotent `stableKey` is sufficient and cheap.
- **Deferred (sibling follow-up):** the audit's "missing domain emits" (control
  status change, vendor-assessment overdue, policy-review due) — each is a
  one-line `emitAutomationEvent` + catalog/contract/label entry, guarded by the
  PR-C catalog-coherence ratchet. Kept out of this PR to keep the schedule
  engine focused.

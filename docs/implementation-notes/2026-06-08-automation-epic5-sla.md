# 2026-06-08 — Automation Epic 5: SLA Timer & Deadline Enforcement

**Commit:** `<sha>` feat(automation): Epic 5 — SLA window + breach sweep

Lets a rule declare an SLA window; a cron sweep flags executions that run
past it and fires a breach action. Closes one of Archer's most-cited
enterprise advantages.

## Design

```
AutomationRule + slaWindowMinutes / slaReminderMinutes
              + slaBreachActionType / slaBreachConfigJson
sla-monitor cron (*/5) → sweepTenant(tenantId, now)
   → RUNNING executions where startedAt + rule.slaWindowMinutes <= now
        → recordCompletion(FAILED, outcome:{slaBreached}) + audit
        → NOTIFY_USER breach action → notifications
```

## Files

| File | Role |
|------|------|
| `prisma/schema/automation.prisma` + migration | 4 nullable SLA columns on AutomationRule |
| `src/app-layer/jobs/sla-monitor.ts` | NEW — per-tenant breach sweep |
| `src/app-layer/jobs/types.ts` | `SlaMonitorPayload` + JobPayloadMap + JOB_DEFAULTS |
| `src/app-layer/jobs/schedules.ts` | `sla-monitor` cron `*/5 * * * *` |
| `src/app-layer/jobs/executor-registry.ts` | registers the executor |
| `src/app-layer/automation/{types,AutomationRuleRepository}.ts` | SLA input + persistence |
| `src/app-layer/schemas/automation.schemas.ts` | SLA fields in create/update |
| API routes `rules` POST + `rules/[id]` PUT | thread SLA fields |
| `src/components/processes/RuleBuilderModal.tsx` | SLA window field in Step 3 |

## Decisions

- **Detection + marking is the load-bearing capability.** The job completes a
  breached execution FAILED with an `slaBreached` outcome + audit event, and
  fires the NOTIFY_USER breach action as notifications. Richer breach actions
  (reassign, status change) record their intent in the outcome and are a
  follow-up — the enforcement signal (breach detected + recorded + notified)
  is what closes the gap.
- **`startedAt ?? createdAt`** anchors the window so the clock starts when the
  execution actually began, falling back to creation.
- **Bounded sweep** (`take: 500`) per tenant keeps the 5-minute cron cheap;
  breached rows leave the RUNNING set once completed, so they don't re-sweep.
- **Breach uses status FAILED + outcome flag**, not a new
  `AutomationExecutionStatus.SLA_BREACHED` enum value — avoids an enum
  migration and keeps the breach queryable via `outcomeJson.slaBreached`.

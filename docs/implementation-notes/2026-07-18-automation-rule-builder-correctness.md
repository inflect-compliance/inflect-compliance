# 2026-07-18 — Automation rule-builder correctness

**Commit:** `<sha>` fix(automation): edit-flow data loss, honest SLA/monitor reframe, honest re-trigger, Issue Zod drift

## Design

Five correctness fixes to the workflow-automation rule builder + SLA/monitor.

1. **Edit-flow data loss.** `RuleBuilderModal` opened edit mode from `EMPTY`
   builder state and never hydrated from the rule — so editing opened blank and
   Save PUT the blank defaults over the stored config. The list row
   (`AutomationRuleRow`) is a thin projection, so edit mode now **fetches the
   full rule detail** (`GET /automation/rules/{id}`) and reverse-maps it into
   `BuilderState` via `detailToBuilderState`, hydrating once per open (keyed on
   rule id so SWR revalidation never clobbers in-progress edits; a create open
   resets to `EMPTY`). The payload builder was extracted to a pure, exported
   `buildRulePayload(form)` so the round-trip is unit-testable:
   `buildRulePayload(detailToBuilderState(d))` reproduces `d`'s config (editing
   + saving with no changes is a no-op). `priority`/`status` are preserved
   automatically — the repo `update` is a partial update and the builder never
   sends them.

2. **SLA + Monitor — DECISION (b): retire the RUNNING-based business-SLA
   framing.** Dispatch settles executions synchronously, so a business SLA on
   RUNNING state never fires and the Monitor's in-flight console was ~always
   empty. `sla-monitor.ts` already documents itself as a **stuck-execution
   watchdog** (catches genuinely hung runs — dead worker, unresponsive
   webhook), so we kept it as-is and made the UI honest: the builder's "SLA
   window" input is relabeled **"Stuck-execution timeout (minutes)"**, and
   `MonitorTab` now leads with the recent-activity feed (has data) with a
   **conditional** stuck-execution watchdog card that only renders when an
   execution is actually stuck — no console for a state that never occurs. The
   `slaWindowMinutes` / `slaBreachActionType` DB fields are unchanged (no
   migration); only the framing moved.

3. **Analytics terminology.** The "SLA breaches" KPI is renamed
   **"Stuck-execution breaches"** (`analytics.stuckExecutionBreaches`); the
   value source is unchanged (it counts the watchdog's breaches, which ARE
   stuck-execution breaches now).

4. **Honest re-trigger.** A replay carries a synthetic `entityId = ruleId` and
   the original entityId is never persisted on the execution, so an
   UPDATE_STATUS action would no-op ("No <entity> matched <ruleId>") while the
   panel said "Fired". `reTriggerRule` now **refuses** UPDATE_STATUS replays
   with `reason: 'entity_target_not_replayable'` (rather than enqueue a
   guaranteed-FAIL execution), and `ManualTriggerPanel` reports it truthfully.

5. **Zod drift.** `UpdateStatusConfig.entityType` dropped `'Issue'` — the
   executor's `STATUS_ALLOWLIST` only implements Risk/Task/Control, so an
   'Issue' rule always rejected at runtime. Removing it from the schema means
   an unrunnable rule can no longer be persisted.

## Files

| File | Role |
|------|------|
| `src/components/processes/RuleBuilderModal.tsx` | edit-mode detail fetch + `detailToBuilderState` hydration; pure exported `buildRulePayload` |
| `src/app-layer/usecases/automation-executions.ts` | refuse UPDATE_STATUS replay honestly |
| `src/components/processes/ManualTriggerPanel.tsx` | surface the no-op reason |
| `src/app-layer/schemas/automation.schemas.ts` | drop `'Issue'` from UpdateStatusConfig |
| `src/app/.../processes/MonitorTab.tsx` | recent-activity primary + conditional stuck-execution watchdog |
| `src/app/.../processes/AnalyticsTab.tsx` | "Stuck-execution breaches" label |
| `messages/{en,bg}.json` | reframe copy; drop the dead in-flight keys |
| `prisma/schema/automation.prisma` | reframe the `slaWindowMinutes` doc comment |

## Decisions

- **SLA option (b), not (a).** Building a real entity-deadline SLA (evaluate
  breach from the triggering event / entity due-date, independent of RUNNING)
  is a separate mechanism; the honest, bounded move is to keep the existing
  watchdog and stop mislabeling it as a business deadline.
- **Refuse rather than replay entity-targeting rules.** The original entityId
  isn't stored, so a replay genuinely can't re-target the real entity — refusing
  is more honest than enqueuing a doomed execution that pollutes history.

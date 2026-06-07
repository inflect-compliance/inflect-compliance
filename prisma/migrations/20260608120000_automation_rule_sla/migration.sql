-- Automation Epic 5 — SLA timer + deadline enforcement.
-- Adds optional SLA fields to AutomationRule. All nullable (no SLA by
-- default); the sla-monitor job reads them to detect breached executions.

ALTER TABLE "AutomationRule" ADD COLUMN "slaWindowMinutes" INTEGER;
ALTER TABLE "AutomationRule" ADD COLUMN "slaReminderMinutes" INTEGER;
ALTER TABLE "AutomationRule" ADD COLUMN "slaBreachActionType" "AutomationActionType";
ALTER TABLE "AutomationRule" ADD COLUMN "slaBreachConfigJson" JSONB;

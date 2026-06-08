-- PR-E — time-based triggers: per-rule schedule config (DATE_RELATIVE).
ALTER TABLE "AutomationRule" ADD COLUMN "scheduleConfigJson" JSONB;

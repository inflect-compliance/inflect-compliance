-- PR-F — conditional branching: the ELSE chain target.
ALTER TABLE "AutomationRule" ADD COLUMN "elseRuleId" TEXT;

ALTER TABLE "AutomationRule"
  ADD CONSTRAINT "AutomationRule_elseRuleId_fkey"
  FOREIGN KEY ("elseRuleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AutomationRule_elseRuleId_idx" ON "AutomationRule" ("elseRuleId");

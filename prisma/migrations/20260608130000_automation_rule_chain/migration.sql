-- Automation Epic 7 — multi-step chained rules.
-- AutomationRule.nextRuleId/nextRuleDelay (self-relation "RuleChain") +
-- AutomationExecution.parentExecutionId lineage.

ALTER TABLE "AutomationRule" ADD COLUMN "nextRuleId" TEXT;
ALTER TABLE "AutomationRule" ADD COLUMN "nextRuleDelay" INTEGER;
ALTER TABLE "AutomationExecution" ADD COLUMN "parentExecutionId" TEXT;

CREATE INDEX "AutomationRule_nextRuleId_idx" ON "AutomationRule"("nextRuleId");
CREATE INDEX "AutomationExecution_tenantId_parentExecutionId_idx" ON "AutomationExecution"("tenantId", "parentExecutionId");

ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_nextRuleId_fkey"
    FOREIGN KEY ("nextRuleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- VR-7 — sub-flow nesting: INVOKE_SUBFLOW action + subFlowGroupId linkage.
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'INVOKE_SUBFLOW';

ALTER TABLE "AutomationRule" ADD COLUMN "subFlowGroupId" TEXT;

CREATE INDEX "AutomationRule_tenantId_subFlowGroupId_idx"
  ON "AutomationRule" ("tenantId", "subFlowGroupId");

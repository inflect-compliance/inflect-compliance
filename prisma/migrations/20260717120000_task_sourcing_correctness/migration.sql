-- Add RISK_MONITOR provenance for KRI-breach + risk-appetite-breach spawned tasks.
ALTER TYPE "WorkItemSource" ADD VALUE IF NOT EXISTS 'RISK_MONITOR';

-- KriReading gains a remediation-task pointer + addressed-at stamp so the
-- task-source reconciler can mark a KRI breach addressed on task close.
ALTER TABLE "KriReading" ADD COLUMN "remediationTaskId" TEXT;
ALTER TABLE "KriReading" ADD COLUMN "addressedAt" TIMESTAMP(3);

CREATE INDEX "KriReading_tenantId_remediationTaskId_idx" ON "KriReading"("tenantId", "remediationTaskId");

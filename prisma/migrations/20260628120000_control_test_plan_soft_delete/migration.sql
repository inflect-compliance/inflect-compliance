-- Enroll ControlTestPlan in soft-delete (bulk-delete support).
ALTER TABLE "ControlTestPlan" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ControlTestPlan" ADD COLUMN "deletedByUserId" TEXT;
CREATE INDEX "ControlTestPlan_tenantId_deletedAt_idx" ON "ControlTestPlan"("tenantId", "deletedAt");

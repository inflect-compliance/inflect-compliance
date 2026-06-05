-- Risk + Asset Evidence tab parity — source pointers on Evidence.
-- Same shape as Evidence.taskId / controlId: nullable FK,
-- ON DELETE SET NULL, tenant-scoped composite index.

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN "riskId" TEXT;
ALTER TABLE "Evidence" ADD COLUMN "assetId" TEXT;

-- CreateIndex
CREATE INDEX "Evidence_tenantId_riskId_idx" ON "Evidence"("tenantId", "riskId");
CREATE INDEX "Evidence_tenantId_assetId_idx" ON "Evidence"("tenantId", "assetId");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

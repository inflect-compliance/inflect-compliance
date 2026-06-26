
-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "sourceKind" TEXT,
ADD COLUMN     "sourceRef" TEXT;

-- CreateIndex
CREATE INDEX "Finding_tenantId_sourceKind_sourceRef_idx" ON "Finding"("tenantId", "sourceKind", "sourceRef");


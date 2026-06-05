-- Task Evidence tab parity — source task pointer on Evidence.
-- Mirrors the existing Evidence.controlId shape: nullable FK,
-- ON DELETE SET NULL, tenant-scoped composite index.

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN "taskId" TEXT;

-- CreateIndex
CREATE INDEX "Evidence_tenantId_taskId_idx" ON "Evidence"("tenantId", "taskId");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

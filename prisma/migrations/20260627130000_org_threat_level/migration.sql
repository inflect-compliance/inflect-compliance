
-- CreateEnum
CREATE TYPE "OrgThreatTier" AS ENUM ('GUARDED', 'LOW', 'ELEVATED', 'HIGH', 'SEVERE');

-- AlterEnum
ALTER TYPE "OrgAuditAction" ADD VALUE 'ORG_THREAT_LEVEL_SET';

-- AlterEnum
ALTER TYPE "OrgDashboardWidgetType" ADD VALUE 'ORG_THREAT_LEVEL';

-- CreateTable
CREATE TABLE "OrgThreatLevel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "level" "OrgThreatTier" NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "setByUserId" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgThreatLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgThreatLevel_organizationId_setAt_idx" ON "OrgThreatLevel"("organizationId", "setAt");

-- AddForeignKey
ALTER TABLE "OrgThreatLevel" ADD CONSTRAINT "OrgThreatLevel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- CreateEnum
CREATE TYPE "InitiativeStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrgAuditAction" ADD VALUE 'ORG_INITIATIVE_CREATED';
ALTER TYPE "OrgAuditAction" ADD VALUE 'ORG_INITIATIVE_STATUS_CHANGED';

-- AlterEnum
ALTER TYPE "OrgDashboardWidgetType" ADD VALUE 'ORG_INITIATIVES';

-- CreateTable
CREATE TABLE "OrgSecurityInitiative" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "InitiativeStatus" NOT NULL DEFAULT 'PLANNED',
    "ownerUserId" TEXT,
    "targetDate" TIMESTAMP(3),
    "manualProgressPercent" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSecurityInitiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgInitiativeLink" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "linkedTenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "OrgInitiativeLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgSecurityInitiative_organizationId_status_idx" ON "OrgSecurityInitiative"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrgSecurityInitiative_organizationId_targetDate_idx" ON "OrgSecurityInitiative"("organizationId", "targetDate");

-- CreateIndex
CREATE INDEX "OrgInitiativeLink_organizationId_initiativeId_idx" ON "OrgInitiativeLink"("organizationId", "initiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInitiativeLink_initiativeId_linkedTenantId_entityType_en_key" ON "OrgInitiativeLink"("initiativeId", "linkedTenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "OrgSecurityInitiative" ADD CONSTRAINT "OrgSecurityInitiative_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgInitiativeLink" ADD CONSTRAINT "OrgInitiativeLink_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "OrgSecurityInitiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgInitiativeLink" ADD CONSTRAINT "OrgInitiativeLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- CreateEnum
CREATE TYPE "MaturityDomain" AS ENUM ('GOVERN', 'IDENTIFY', 'PROTECT', 'DETECT', 'RESPOND', 'RECOVER');

-- CreateEnum
CREATE TYPE "MaturityLevel" AS ENUM ('INITIAL', 'REPEATABLE', 'DEFINED', 'MANAGED', 'OPTIMIZING');

-- AlterEnum
ALTER TYPE "OrgAuditAction" ADD VALUE 'ORG_MATURITY_RATING_SET';

-- AlterEnum
ALTER TYPE "OrgDashboardWidgetType" ADD VALUE 'ORG_MATURITY';

-- CreateTable
CREATE TABLE "OrgMaturityRating" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domain" "MaturityDomain" NOT NULL,
    "level" "MaturityLevel" NOT NULL,
    "rationale" TEXT,
    "ratedByUserId" TEXT NOT NULL,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMaturityRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgMaturityRating_organizationId_domain_ratedAt_idx" ON "OrgMaturityRating"("organizationId", "domain", "ratedAt");

-- AddForeignKey
ALTER TABLE "OrgMaturityRating" ADD CONSTRAINT "OrgMaturityRating_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


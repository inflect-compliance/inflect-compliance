-- NIS2 Article 23 incident response (feat/nis2-incident-response)
-- ═══════════════════════════════════════════════════════════════════
-- Three tenant-scoped models (Incident, IncidentNotification,
-- IncidentTimelineEntry) + their enums + the per-tenant notification
-- authority field on TenantSecuritySettings. RLS (Epic A.1 Class-A
-- shape) is applied at the bottom for all three tables.
-- Methodology adapted (CC BY 4.0) from Kshreenath/NIS2-Checklist —
-- Paolo Carner / BARE Consulting.

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentPhase" AS ENUM ('DETECTION', 'CLASSIFICATION', 'EARLY_WARNING', 'CONTAINMENT', 'INVESTIGATION', 'DETAILED_REPORT', 'RECOVERY', 'CLOSED');

-- CreateEnum
CREATE TYPE "IncidentNotificationKind" AS ENUM ('EARLY_WARNING_24H', 'DETAILED_72H', 'FINAL_1MONTH');

-- CreateEnum
CREATE TYPE "IncidentNotificationStatus" AS ENUM ('PENDING', 'DUE', 'OVERDUE', 'SUBMITTED', 'NOT_REQUIRED');

-- AlterTable
ALTER TABLE "TenantSecuritySettings" ADD COLUMN     "incidentAuthority" TEXT;

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "phase" "IncidentPhase" NOT NULL DEFAULT 'DETECTION',
    "incidentType" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "reportable" BOOLEAN NOT NULL DEFAULT false,
    "reportedAt" TIMESTAMP(3),
    "containedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "linkedControlIds" TEXT[],
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "kind" "IncidentNotificationKind" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "IncidentNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "submissionRef" TEXT,
    "submissionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentTimelineEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "entry" TEXT NOT NULL,
    "phaseAtTime" "IncidentPhase" NOT NULL,

    CONSTRAINT "IncidentTimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incident_tenantId_idx" ON "Incident"("tenantId");

-- CreateIndex
CREATE INDEX "Incident_tenantId_phase_idx" ON "Incident"("tenantId", "phase");

-- CreateIndex
CREATE INDEX "Incident_tenantId_severity_detectedAt_idx" ON "Incident"("tenantId", "severity", "detectedAt");

-- CreateIndex
CREATE INDEX "Incident_tenantId_ownerUserId_idx" ON "Incident"("tenantId", "ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_id_tenantId_key" ON "Incident"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_tenantId_reference_key" ON "Incident"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "IncidentNotification_tenantId_idx" ON "IncidentNotification"("tenantId");

-- CreateIndex
CREATE INDEX "IncidentNotification_tenantId_incidentId_idx" ON "IncidentNotification"("tenantId", "incidentId");

-- CreateIndex
CREATE INDEX "IncidentNotification_tenantId_status_dueAt_idx" ON "IncidentNotification"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentNotification_incidentId_kind_key" ON "IncidentNotification"("incidentId", "kind");

-- CreateIndex
CREATE INDEX "IncidentTimelineEntry_tenantId_idx" ON "IncidentTimelineEntry"("tenantId");

-- CreateIndex
CREATE INDEX "IncidentTimelineEntry_tenantId_incidentId_at_idx" ON "IncidentTimelineEntry"("tenantId", "incidentId", "at");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentNotification" ADD CONSTRAINT "IncidentNotification_incidentId_tenantId_fkey" FOREIGN KEY ("incidentId", "tenantId") REFERENCES "Incident"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentNotification" ADD CONSTRAINT "IncidentNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentTimelineEntry" ADD CONSTRAINT "IncidentTimelineEntry_incidentId_tenantId_fkey" FOREIGN KEY ("incidentId", "tenantId") REFERENCES "Incident"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentTimelineEntry" ADD CONSTRAINT "IncidentTimelineEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Row-Level Security (Epic A.1 Class-A shape) — every direct-tenantId
-- table gets tenant_isolation + tenant_isolation_insert + superuser_bypass
-- + FORCE ROW LEVEL SECURITY. IDEMPOTENT via DROP POLICY IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════

-- RLS — Incident
ALTER TABLE "Incident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Incident" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Incident";
CREATE POLICY tenant_isolation ON "Incident"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Incident";
CREATE POLICY tenant_isolation_insert ON "Incident"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "Incident";
CREATE POLICY superuser_bypass ON "Incident"
    USING (current_setting('role') != 'app_user');
GRANT SELECT, INSERT, UPDATE, DELETE ON "Incident" TO app_user;

-- RLS — IncidentNotification
ALTER TABLE "IncidentNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncidentNotification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IncidentNotification";
CREATE POLICY tenant_isolation ON "IncidentNotification"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "IncidentNotification";
CREATE POLICY tenant_isolation_insert ON "IncidentNotification"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "IncidentNotification";
CREATE POLICY superuser_bypass ON "IncidentNotification"
    USING (current_setting('role') != 'app_user');
GRANT SELECT, INSERT, UPDATE, DELETE ON "IncidentNotification" TO app_user;

-- RLS — IncidentTimelineEntry
ALTER TABLE "IncidentTimelineEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncidentTimelineEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IncidentTimelineEntry";
CREATE POLICY tenant_isolation ON "IncidentTimelineEntry"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "IncidentTimelineEntry";
CREATE POLICY tenant_isolation_insert ON "IncidentTimelineEntry"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "IncidentTimelineEntry";
CREATE POLICY superuser_bypass ON "IncidentTimelineEntry"
    USING (current_setting('role') != 'app_user');
GRANT SELECT, INSERT, UPDATE, DELETE ON "IncidentTimelineEntry" TO app_user;

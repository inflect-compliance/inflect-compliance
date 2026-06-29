-- Incident containment runbooks + forensic evidence linking
-- ═══════════════════════════════════════════════════════════════════
-- Adds per-incident containment-step tracking (Incident.completedContainmentSteps)
-- and the IncidentEvidence junction (link forensic Evidence records to an
-- incident). RLS (Epic A.1 Class-A) applied to the junction.
-- Containment-runbook methodology adapted (CC BY 4.0) from
-- Kshreenath/NIS2-Checklist — Paolo Carner / BARE Consulting.

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "completedContainmentSteps" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "IncidentEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "forensicCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentEvidence_tenantId_idx" ON "IncidentEvidence"("tenantId");

-- CreateIndex
CREATE INDEX "IncidentEvidence_tenantId_incidentId_idx" ON "IncidentEvidence"("tenantId", "incidentId");

-- CreateIndex
CREATE INDEX "IncidentEvidence_tenantId_evidenceId_idx" ON "IncidentEvidence"("tenantId", "evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentEvidence_incidentId_evidenceId_key" ON "IncidentEvidence"("incidentId", "evidenceId");

-- AddForeignKey
ALTER TABLE "IncidentEvidence" ADD CONSTRAINT "IncidentEvidence_evidenceId_tenantId_fkey" FOREIGN KEY ("evidenceId", "tenantId") REFERENCES "Evidence"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentEvidence" ADD CONSTRAINT "IncidentEvidence_incidentId_tenantId_fkey" FOREIGN KEY ("incidentId", "tenantId") REFERENCES "Incident"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentEvidence" ADD CONSTRAINT "IncidentEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Row-Level Security (Epic A.1 Class-A shape) — IDEMPOTENT.
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "IncidentEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncidentEvidence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IncidentEvidence";
CREATE POLICY tenant_isolation ON "IncidentEvidence"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "IncidentEvidence";
CREATE POLICY tenant_isolation_insert ON "IncidentEvidence"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "IncidentEvidence";
CREATE POLICY superuser_bypass ON "IncidentEvidence"
    USING (current_setting('role') != 'app_user');
GRANT SELECT, INSERT, UPDATE, DELETE ON "IncidentEvidence" TO app_user;

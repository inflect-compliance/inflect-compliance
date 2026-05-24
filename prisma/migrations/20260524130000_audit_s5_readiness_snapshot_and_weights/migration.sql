-- Audit S5 — Audit Readiness & Scoring (2026-05-24)
--
-- Two schema changes:
--
-- 1. `Tenant.readinessWeightsJson` — per-tenant override of the
--    hardcoded ISO27001 / NIS2 / GENERIC weight constants. NULL
--    means use the defaults shipped with the platform.
--
-- 2. `ReadinessSnapshot` — time-series row written every time
--    `computeReadiness` runs. Auditors get a trend chart instead
--    of just a point-in-time number.

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "readinessWeightsJson" JSONB;

CREATE TABLE IF NOT EXISTS "ReadinessSnapshot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "frameworkKey" TEXT NOT NULL,
  "auditCycleId" TEXT,
  "score" INTEGER NOT NULL,
  "breakdownJson" JSONB NOT NULL,
  "gapCount" INTEGER NOT NULL DEFAULT 0,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "computedByUserId" TEXT,
  CONSTRAINT "ReadinessSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReadinessSnapshot"
  ADD CONSTRAINT "ReadinessSnapshot_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "ReadinessSnapshot"
  ADD CONSTRAINT "ReadinessSnapshot_auditCycleId_fkey"
  FOREIGN KEY ("auditCycleId") REFERENCES "AuditCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ReadinessSnapshot_tenantId_idx" ON "ReadinessSnapshot"("tenantId");
CREATE INDEX IF NOT EXISTS "ReadinessSnapshot_tenantId_frameworkKey_computedAt_idx" ON "ReadinessSnapshot"("tenantId", "frameworkKey", "computedAt");
CREATE INDEX IF NOT EXISTS "ReadinessSnapshot_tenantId_auditCycleId_idx" ON "ReadinessSnapshot"("tenantId", "auditCycleId");

-- RLS — Class-A direct-scoped (three-policy setup), mirrors the
-- canonical shape from the Epic G-7 / R26-PRA migrations.
ALTER TABLE "ReadinessSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReadinessSnapshot" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ReadinessSnapshot";
CREATE POLICY tenant_isolation ON "ReadinessSnapshot"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ReadinessSnapshot";
CREATE POLICY tenant_isolation_insert ON "ReadinessSnapshot"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ReadinessSnapshot";
CREATE POLICY superuser_bypass ON "ReadinessSnapshot"
    USING (current_setting('role') != 'app_user');

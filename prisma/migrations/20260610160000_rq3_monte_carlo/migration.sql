-- RQ-3 — Monte Carlo simulation run storage.
CREATE TABLE "RiskSimulationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual',
    "createdByUserId" TEXT,
    "iterations" INTEGER NOT NULL DEFAULT 10000,
    "confidenceLevels" JSONB NOT NULL DEFAULT '[0.90, 0.95, 0.99]',
    "seed" INTEGER,
    "riskFilterJson" JSONB,
    "correlationId" TEXT,
    "portfolioMean" DOUBLE PRECISION,
    "portfolioP50" DOUBLE PRECISION,
    "portfolioP90" DOUBLE PRECISION,
    "portfolioP95" DOUBLE PRECISION,
    "portfolioP99" DOUBLE PRECISION,
    "portfolioStdDev" DOUBLE PRECISION,
    "perRiskResultsJson" JSONB,
    "lecPointsJson" JSONB,
    "convergenceDelta" DOUBLE PRECISION,
    "executionMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskSimulationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiskSimulationRun_tenantId_createdAt_idx" ON "RiskSimulationRun"("tenantId", "createdAt");
CREATE INDEX "RiskSimulationRun_tenantId_status_idx" ON "RiskSimulationRun"("tenantId", "status");
ALTER TABLE "RiskSimulationRun" ADD CONSTRAINT "RiskSimulationRun_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── RLS (tenant isolation) ──
ALTER TABLE "RiskSimulationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskSimulationRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RiskSimulationRun";
CREATE POLICY tenant_isolation ON "RiskSimulationRun"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskSimulationRun";
CREATE POLICY tenant_isolation_insert ON "RiskSimulationRun"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "RiskSimulationRun";
CREATE POLICY superuser_bypass ON "RiskSimulationRun"
    USING (current_setting('role') != 'app_user');

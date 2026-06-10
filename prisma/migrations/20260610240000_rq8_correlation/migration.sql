-- RQ-8 — pairwise risk correlation.
CREATE TABLE "RiskCorrelation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "riskAId" TEXT NOT NULL,
    "riskBId" TEXT NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RiskCorrelation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RiskCorrelation_tenantId_riskAId_riskBId_key" ON "RiskCorrelation"("tenantId", "riskAId", "riskBId");
CREATE INDEX "RiskCorrelation_tenantId_idx" ON "RiskCorrelation"("tenantId");
CREATE INDEX "RiskCorrelation_riskAId_idx" ON "RiskCorrelation"("riskAId");
CREATE INDEX "RiskCorrelation_riskBId_idx" ON "RiskCorrelation"("riskBId");
ALTER TABLE "RiskCorrelation" ADD CONSTRAINT "RiskCorrelation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RiskCorrelation" ADD CONSTRAINT "RiskCorrelation_riskAId_fkey" FOREIGN KEY ("riskAId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskCorrelation" ADD CONSTRAINT "RiskCorrelation_riskBId_fkey" FOREIGN KEY ("riskBId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS (tenant isolation) ──
ALTER TABLE "RiskCorrelation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskCorrelation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RiskCorrelation";
CREATE POLICY tenant_isolation ON "RiskCorrelation" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskCorrelation";
CREATE POLICY tenant_isolation_insert ON "RiskCorrelation" FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "RiskCorrelation";
CREATE POLICY superuser_bypass ON "RiskCorrelation" USING (current_setting('role') != 'app_user');

-- RQ-6 — key risk indicators + readings.
CREATE TABLE "KeyRiskIndicator" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "riskId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'HIGHER_IS_WORSE',
    "greenMax" DOUBLE PRECISION,
    "amberMax" DOUBLE PRECISION,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "ownerUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "automationRuleId" TEXT,
    "targetValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KeyRiskIndicator_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KeyRiskIndicator_tenantId_idx" ON "KeyRiskIndicator"("tenantId");
CREATE INDEX "KeyRiskIndicator_tenantId_riskId_idx" ON "KeyRiskIndicator"("tenantId", "riskId");
CREATE INDEX "KeyRiskIndicator_tenantId_isActive_idx" ON "KeyRiskIndicator"("tenantId", "isActive");
CREATE INDEX "KeyRiskIndicator_riskId_idx" ON "KeyRiskIndicator"("riskId");
CREATE INDEX "KeyRiskIndicator_ownerUserId_idx" ON "KeyRiskIndicator"("ownerUserId");
ALTER TABLE "KeyRiskIndicator" ADD CONSTRAINT "KeyRiskIndicator_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KeyRiskIndicator" ADD CONSTRAINT "KeyRiskIndicator_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KeyRiskIndicator" ADD CONSTRAINT "KeyRiskIndicator_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "KriReading" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kriId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "ragStatus" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT,
    "note" TEXT,
    CONSTRAINT "KriReading_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KriReading_kriId_recordedAt_idx" ON "KriReading"("kriId", "recordedAt");
CREATE INDEX "KriReading_tenantId_recordedAt_idx" ON "KriReading"("tenantId", "recordedAt");
CREATE INDEX "KriReading_tenantId_kriId_idx" ON "KriReading"("tenantId", "kriId");
ALTER TABLE "KriReading" ADD CONSTRAINT "KriReading_kriId_fkey" FOREIGN KEY ("kriId") REFERENCES "KeyRiskIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KriReading" ADD CONSTRAINT "KriReading_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── RLS (tenant isolation) ──
ALTER TABLE "KeyRiskIndicator" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KeyRiskIndicator" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "KeyRiskIndicator";
CREATE POLICY tenant_isolation ON "KeyRiskIndicator" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "KeyRiskIndicator";
CREATE POLICY tenant_isolation_insert ON "KeyRiskIndicator" FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "KeyRiskIndicator";
CREATE POLICY superuser_bypass ON "KeyRiskIndicator" USING (current_setting('role') != 'app_user');

ALTER TABLE "KriReading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KriReading" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "KriReading";
CREATE POLICY tenant_isolation ON "KriReading" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "KriReading";
CREATE POLICY tenant_isolation_insert ON "KriReading" FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "KriReading";
CREATE POLICY superuser_bypass ON "KriReading" USING (current_setting('role') != 'app_user');

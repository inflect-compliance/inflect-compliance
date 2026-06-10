-- RQ-2 — Risk appetite & tolerance framework (two additive tables).
CREATE TABLE "RiskAppetiteConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "totalAleThreshold" DOUBLE PRECISION,
    "singleRiskAleMax" DOUBLE PRECISION,
    "qualScoreMax" INTEGER,
    "categoryOverridesJson" JSONB,
    "appetiteStatement" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewCadence" "ReviewCadence" NOT NULL DEFAULT 'ANNUALLY',
    "nextReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RiskAppetiteConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RiskAppetiteConfig_tenantId_key" ON "RiskAppetiteConfig"("tenantId");
CREATE INDEX "RiskAppetiteConfig_tenantId_idx" ON "RiskAppetiteConfig"("tenantId");
ALTER TABLE "RiskAppetiteConfig" ADD CONSTRAINT "RiskAppetiteConfig_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RiskAppetiteBreach" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "breachType" TEXT NOT NULL,
    "riskId" TEXT,
    "category" TEXT,
    "thresholdValue" DOUBLE PRECISION NOT NULL,
    "actualValue" DOUBLE PRECISION NOT NULL,
    "notifiedUserIds" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "acknowledgementNote" TEXT,
    CONSTRAINT "RiskAppetiteBreach_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiskAppetiteBreach_tenantId_detectedAt_idx" ON "RiskAppetiteBreach"("tenantId", "detectedAt");
CREATE INDEX "RiskAppetiteBreach_tenantId_breachType_idx" ON "RiskAppetiteBreach"("tenantId", "breachType");
CREATE INDEX "RiskAppetiteBreach_tenantId_resolvedAt_idx" ON "RiskAppetiteBreach"("tenantId", "resolvedAt");
CREATE INDEX "RiskAppetiteBreach_riskId_idx" ON "RiskAppetiteBreach"("riskId");
ALTER TABLE "RiskAppetiteBreach" ADD CONSTRAINT "RiskAppetiteBreach_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RiskAppetiteBreach" ADD CONSTRAINT "RiskAppetiteBreach_riskId_fkey"
    FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── RLS (tenant isolation) ──
ALTER TABLE "RiskAppetiteConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskAppetiteConfig" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RiskAppetiteConfig";
CREATE POLICY tenant_isolation ON "RiskAppetiteConfig"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskAppetiteConfig";
CREATE POLICY tenant_isolation_insert ON "RiskAppetiteConfig"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "RiskAppetiteConfig";
CREATE POLICY superuser_bypass ON "RiskAppetiteConfig"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "RiskAppetiteBreach" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskAppetiteBreach" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RiskAppetiteBreach";
CREATE POLICY tenant_isolation ON "RiskAppetiteBreach"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskAppetiteBreach";
CREATE POLICY tenant_isolation_insert ON "RiskAppetiteBreach"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "RiskAppetiteBreach";
CREATE POLICY superuser_bypass ON "RiskAppetiteBreach"
    USING (current_setting('role') != 'app_user');

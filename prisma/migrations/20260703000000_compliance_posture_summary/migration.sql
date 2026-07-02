-- AI compliance-posture summary — daily-cached tenant-wide narrative + advice.
--
-- One row per tenant (upsert by tenantId). The `compliance-posture-summary`
-- cron regenerates it daily; the dashboard hero reads the cached row cheaply
-- and never calls an LLM on the render path. Aggregate, non-sensitive prose —
-- NOT encrypted, but sanitised on write. Canonical non-nullable-tenant RLS
-- triple (mirrors 20260701150000_vendor_monitoring).

-- ─── 1. Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CompliancePostureSummary" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "generatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postureLabel"  TEXT NOT NULL,
    "maturityScore" INTEGER,
    "summaryText"   TEXT NOT NULL,
    "adviceJson"    JSONB NOT NULL DEFAULT '[]',
    "signalsJson"   JSONB NOT NULL DEFAULT '{}',
    "provider"      TEXT NOT NULL,
    "model"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompliancePostureSummary_pkey" PRIMARY KEY ("id")
);

-- One "latest" row per tenant (upsert target) + the tenantId-leading index
-- the schema-index-coverage guardrail requires.
CREATE UNIQUE INDEX IF NOT EXISTS "CompliancePostureSummary_tenantId_key" ON "CompliancePostureSummary" ("tenantId");
CREATE INDEX IF NOT EXISTS "CompliancePostureSummary_tenantId_idx"        ON "CompliancePostureSummary" ("tenantId");

-- ─── 2. Foreign key ─────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE "CompliancePostureSummary" ADD CONSTRAINT "CompliancePostureSummary_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. RLS (standard non-nullable-tenant triple) ───────────────────
ALTER TABLE "CompliancePostureSummary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompliancePostureSummary" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "CompliancePostureSummary";
CREATE POLICY tenant_isolation ON "CompliancePostureSummary"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "CompliancePostureSummary";
CREATE POLICY tenant_isolation_insert ON "CompliancePostureSummary"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "CompliancePostureSummary";
CREATE POLICY superuser_bypass ON "CompliancePostureSummary"
    USING (current_setting('role') != 'app_user');

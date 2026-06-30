-- Scanner ingestion (DevSecOps SARIF) — the first connector of the
-- "external security signal → compliance graph" subsystem (sibling to
-- the Cve / AssetVulnerability tables from 20260628130000). Two
-- tenant-scoped tables, each with the canonical non-nullable-tenant RLS
-- triple (tenant_isolation + tenant_isolation_insert + superuser_bypass
-- under FORCE ROW LEVEL SECURITY), mirroring AssetVulnerability.

-- ─── 1. ScannerRun ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ScannerRun" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "source"       TEXT NOT NULL,
    "scanType"     TEXT NOT NULL,
    "ranAt"        TIMESTAMP(3) NOT NULL,
    "outcome"      TEXT NOT NULL,
    "repoRef"      TEXT,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "ingestedVia"  TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScannerRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScannerRun_tenantId_source_ranAt_idx"   ON "ScannerRun" ("tenantId", "source", "ranAt");
CREATE INDEX IF NOT EXISTS "ScannerRun_tenantId_scanType_ranAt_idx" ON "ScannerRun" ("tenantId", "scanType", "ranAt");
CREATE INDEX IF NOT EXISTS "ScannerRun_tenantId_idx"                ON "ScannerRun" ("tenantId");

-- ─── 2. ScannerFinding ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ScannerFinding" (
    "id"           TEXT NOT NULL,
    "scannerRunId" TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "fingerprint"  TEXT NOT NULL,
    "ruleId"       TEXT NOT NULL,
    "severity"     TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "location"     TEXT,
    "cweIds"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status"       TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScannerFinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScannerFinding_tenantId_fingerprint_key"      ON "ScannerFinding" ("tenantId", "fingerprint");
CREATE INDEX IF NOT EXISTS "ScannerFinding_tenantId_scannerRunId_status_idx"     ON "ScannerFinding" ("tenantId", "scannerRunId", "status");
CREATE INDEX IF NOT EXISTS "ScannerFinding_tenantId_status_severity_idx"         ON "ScannerFinding" ("tenantId", "status", "severity");
CREATE INDEX IF NOT EXISTS "ScannerFinding_scannerRunId_idx"                     ON "ScannerFinding" ("scannerRunId");

-- ─── 3. Foreign keys ────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE "ScannerRun"
        ADD CONSTRAINT "ScannerRun_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ScannerFinding"
        ADD CONSTRAINT "ScannerFinding_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ScannerFinding"
        ADD CONSTRAINT "ScannerFinding_scannerRunId_fkey"
        FOREIGN KEY ("scannerRunId") REFERENCES "ScannerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. RLS (standard non-nullable-tenant form) ─────────────────────
-- tenantId is NOT NULL on both tables → the canonical two-policy shape:
--   tenant_isolation        FOR ALL USING (own)        — read + UPDATE.
--   tenant_isolation_insert FOR INSERT WITH CHECK (own).
--   superuser_bypass        USING (role != 'app_user') — migrations,
--                           seeds, and the system ingestion path when it
--                           runs as the table owner. Grants for app_user
--                           come from prisma/init-roles.sh.
ALTER TABLE "ScannerRun"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScannerRun"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "ScannerFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScannerFinding" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "ScannerRun";
CREATE POLICY tenant_isolation ON "ScannerRun"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ScannerRun";
CREATE POLICY tenant_isolation_insert ON "ScannerRun"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ScannerRun";
CREATE POLICY superuser_bypass ON "ScannerRun"
    USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS tenant_isolation ON "ScannerFinding";
CREATE POLICY tenant_isolation ON "ScannerFinding"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ScannerFinding";
CREATE POLICY tenant_isolation_insert ON "ScannerFinding"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ScannerFinding";
CREATE POLICY superuser_bypass ON "ScannerFinding"
    USING (current_setting('role') != 'app_user');

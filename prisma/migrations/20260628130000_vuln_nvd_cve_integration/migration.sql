-- ═══════════════════════════════════════════════════════════════════
-- Vulnerability integration — NVD CVE catalog + asset matching
-- ═══════════════════════════════════════════════════════════════════
--
-- Three structural pieces:
--   1. Asset gains optional product-identity columns (cpe/vendor/
--      product/version) so the global CVE catalog can be matched to a
--      tenant's declared assets. Optional + best-effort.
--   2. `Cve` — global reference catalog (no tenantId → RLS-exempt by
--      construction, like the framework/clause reference tables).
--   3. `AssetVulnerability` — tenant-scoped link between a CVE and one
--      of the tenant's assets. Carries tenantId → gets full RLS
--      (tenant_isolation + insert + superuser_bypass + FORCE), matching
--      every other tenant-scoped table. `note` is encrypted at rest
--      (Epic B manifest) + sanitised on write (Epic D).
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Asset product-identity columns ──────────────────────────────
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "cpe"     TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "vendor"  TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "product" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "version" TEXT;

-- ─── 2. Global CVE catalog ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Cve" (
    "id"             TEXT NOT NULL,
    "publishedAt"    TIMESTAMP(3) NOT NULL,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL,
    "cvssScore"      DOUBLE PRECISION,
    "cvssSeverity"   TEXT,
    "summary"        TEXT NOT NULL,
    "cpeMatches"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "references"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "fetchedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cve_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Cve_cvssSeverity_publishedAt_idx" ON "Cve" ("cvssSeverity", "publishedAt");
CREATE INDEX IF NOT EXISTS "Cve_lastModifiedAt_idx" ON "Cve" ("lastModifiedAt");

-- ─── 3. Tenant-scoped asset↔CVE link ────────────────────────────────
CREATE TABLE IF NOT EXISTS "AssetVulnerability" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "assetId"    TEXT NOT NULL,
    "cveId"      TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'OPEN',
    "matchedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedVia" TEXT NOT NULL,
    "note"       TEXT,
    CONSTRAINT "AssetVulnerability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssetVulnerability_tenantId_assetId_cveId_key" ON "AssetVulnerability" ("tenantId", "assetId", "cveId");
CREATE INDEX IF NOT EXISTS "AssetVulnerability_tenantId_status_idx"  ON "AssetVulnerability" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "AssetVulnerability_tenantId_assetId_idx" ON "AssetVulnerability" ("tenantId", "assetId");
CREATE INDEX IF NOT EXISTS "AssetVulnerability_tenantId_cveId_idx"   ON "AssetVulnerability" ("tenantId", "cveId");
CREATE INDEX IF NOT EXISTS "AssetVulnerability_cveId_idx"            ON "AssetVulnerability" ("cveId");
CREATE INDEX IF NOT EXISTS "AssetVulnerability_assetId_idx"          ON "AssetVulnerability" ("assetId");

DO $$ BEGIN
    ALTER TABLE "AssetVulnerability"
        ADD CONSTRAINT "AssetVulnerability_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssetVulnerability"
        ADD CONSTRAINT "AssetVulnerability_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssetVulnerability"
        ADD CONSTRAINT "AssetVulnerability_cveId_fkey"
        FOREIGN KEY ("cveId") REFERENCES "Cve"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. RLS for AssetVulnerability (standard non-nullable-tenant form) ─
-- tenantId is NOT NULL, so the canonical two-policy shape applies:
--   tenant_isolation        FOR ALL USING (own)   — read + the UPDATE
--                           WITH-CHECK fallback (USING doubles as WITH
--                           CHECK on an ALL policy).
--   tenant_isolation_insert FOR INSERT WITH CHECK (own).
--   superuser_bypass        USING (role != 'app_user') — migrations,
--                           seeds, and the system nvd-cve-sync job
--                           (which runs cross-tenant as the table owner).
-- Grants for app_user come from prisma/init-roles.sh (ALTER DEFAULT
-- PRIVILEGES on schema public), so no per-table GRANT is needed.
ALTER TABLE "AssetVulnerability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetVulnerability" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "AssetVulnerability";
CREATE POLICY tenant_isolation ON "AssetVulnerability"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS tenant_isolation_insert ON "AssetVulnerability";
CREATE POLICY tenant_isolation_insert ON "AssetVulnerability"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS superuser_bypass ON "AssetVulnerability";
CREATE POLICY superuser_bypass ON "AssetVulnerability"
    USING (current_setting('role') != 'app_user');

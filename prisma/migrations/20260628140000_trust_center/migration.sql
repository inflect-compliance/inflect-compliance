-- ═══════════════════════════════════════════════════════════════════
-- Trust Center — public, tenant-curated compliance posture page
-- ═══════════════════════════════════════════════════════════════════
--
-- SECURITY-CRITICAL surface. `TrustCenter` stores an EXPLICIT projection
-- the tenant composes; the public page (/trust/<slug>) reads ONLY this row.
-- It carries `tenantId`, so it gets the standard tenant RLS treatment for
-- the AUTHENTICATED compose/edit path (runInTenantContext). The PUBLIC read
-- runs through the table owner (system role → superuser_bypass) and selects
-- a single curated row by `slug` — never under app_user, never cross-table.
--
-- `enabled` defaults FALSE: a tenant has no public page until they
-- explicitly build + publish one.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "TrustCenter" (
    "id"                  TEXT NOT NULL,
    "tenantId"            TEXT NOT NULL,
    "slug"                TEXT NOT NULL,
    "enabled"             BOOLEAN NOT NULL DEFAULT false,
    "indexable"           BOOLEAN NOT NULL DEFAULT false,
    "displayName"         TEXT NOT NULL,
    "tagline"             TEXT,
    "publishedFrameworks" JSONB NOT NULL DEFAULT '[]',
    "postureSummary"      TEXT,
    "publishedDocuments"  JSONB NOT NULL DEFAULT '[]',
    "securityContact"     TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    "publishedByUserId"   TEXT,
    CONSTRAINT "TrustCenter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrustCenter_tenantId_key" ON "TrustCenter" ("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrustCenter_slug_key" ON "TrustCenter" ("slug");
CREATE INDEX IF NOT EXISTS "TrustCenter_tenantId_idx" ON "TrustCenter" ("tenantId");

DO $$ BEGIN
    ALTER TABLE "TrustCenter"
        ADD CONSTRAINT "TrustCenter_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── RLS (standard non-nullable-tenant form) ────────────────────────
-- Guards the AUTHENTICATED compose path under app_user. The public read
-- uses the owner role (superuser_bypass), reading one curated row by slug.
ALTER TABLE "TrustCenter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrustCenter" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "TrustCenter";
CREATE POLICY tenant_isolation ON "TrustCenter"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS tenant_isolation_insert ON "TrustCenter";
CREATE POLICY tenant_isolation_insert ON "TrustCenter"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS superuser_bypass ON "TrustCenter";
CREATE POLICY superuser_bypass ON "TrustCenter"
    USING (current_setting('role') != 'app_user');

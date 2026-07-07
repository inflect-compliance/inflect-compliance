-- PR-2 — ConnectedIdentityAccount: directory accounts synced from Okta /
-- Google Workspace. Tenant-scoped, RLS-protected (standard non-nullable
-- tenant triple, cloned from 20260703000000_compliance_posture_summary).

-- ─── 1. Enum ───
DO $$ BEGIN
    CREATE TYPE "ConnectedAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEPROVISIONED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Table ───
CREATE TABLE IF NOT EXISTS "ConnectedIdentityAccount" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "provider"       TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "email"          TEXT NOT NULL,
    "displayName"    TEXT,
    "status"         "ConnectedAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "isAdmin"        BOOLEAN NOT NULL DEFAULT false,
    "mfaEnrolled"    BOOLEAN NOT NULL DEFAULT false,
    "groupsJson"     JSONB NOT NULL DEFAULT '[]',
    "lastActiveAt"   TIMESTAMP(3),
    "syncedAt"       TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConnectedIdentityAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedIdentityAccount_tenantId_provider_externalUserId_key"
    ON "ConnectedIdentityAccount" ("tenantId", "provider", "externalUserId");
CREATE INDEX IF NOT EXISTS "ConnectedIdentityAccount_tenantId_provider_idx"
    ON "ConnectedIdentityAccount" ("tenantId", "provider");
CREATE INDEX IF NOT EXISTS "ConnectedIdentityAccount_tenantId_status_idx"
    ON "ConnectedIdentityAccount" ("tenantId", "status");

-- ─── 3. Foreign key ───
DO $$ BEGIN
    ALTER TABLE "ConnectedIdentityAccount" ADD CONSTRAINT "ConnectedIdentityAccount_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. RLS (standard non-nullable-tenant triple) ───
ALTER TABLE "ConnectedIdentityAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConnectedIdentityAccount" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "ConnectedIdentityAccount";
CREATE POLICY tenant_isolation ON "ConnectedIdentityAccount"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ConnectedIdentityAccount";
CREATE POLICY tenant_isolation_insert ON "ConnectedIdentityAccount"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ConnectedIdentityAccount";
CREATE POLICY superuser_bypass ON "ConnectedIdentityAccount"
    USING (current_setting('role') != 'app_user');

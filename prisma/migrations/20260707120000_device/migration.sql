-- PR-5 — Device (managed endpoint) + TenantDeviceToken (agent-report auth).
-- Both tenant-scoped, RLS-protected. Cloned RLS triple from the personnel migration.

-- ─── 1. Enum ───
DO $$ BEGIN
    CREATE TYPE "DevicePlatform" AS ENUM ('MACOS', 'WINDOWS', 'LINUX');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Device table ───
CREATE TABLE IF NOT EXISTS "Device" (
    "id"                     TEXT NOT NULL,
    "tenantId"               TEXT NOT NULL,
    "employeeId"             TEXT,
    "serialNumber"           TEXT,
    "hostname"               TEXT,
    "platform"               "DevicePlatform" NOT NULL,
    "source"                 TEXT NOT NULL DEFAULT 'MANUAL',
    "diskEncrypted"          BOOLEAN,
    "screenLockEnabled"      BOOLEAN,
    "antivirusRunning"       BOOLEAN,
    "passwordManagerPresent" BOOLEAN,
    "lastCheckIn"            TIMESTAMP(3),
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Device_tenantId_serialNumber_key" ON "Device" ("tenantId", "serialNumber");
CREATE INDEX IF NOT EXISTS "Device_tenantId_employeeId_idx"          ON "Device" ("tenantId", "employeeId");
CREATE INDEX IF NOT EXISTS "Device_tenantId_platform_idx"            ON "Device" ("tenantId", "platform");

DO $$ BEGIN
    ALTER TABLE "Device" ADD CONSTRAINT "Device_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "Device" ADD CONSTRAINT "Device_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Device" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Device";
CREATE POLICY tenant_isolation ON "Device"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Device";
CREATE POLICY tenant_isolation_insert ON "Device"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "Device";
CREATE POLICY superuser_bypass ON "Device"
    USING (current_setting('role') != 'app_user');

-- ─── 3. TenantDeviceToken table ───
CREATE TABLE IF NOT EXISTS "TenantDeviceToken" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash"   TEXT NOT NULL,
    "expiresAt"   TIMESTAMP(3),
    "revokedAt"   TIMESTAMP(3),
    "lastUsedAt"  TIMESTAMP(3),
    "lastUsedIp"  TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantDeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantDeviceToken_tokenHash_key"        ON "TenantDeviceToken" ("tokenHash");
CREATE INDEX IF NOT EXISTS "TenantDeviceToken_tenantId_idx"                ON "TenantDeviceToken" ("tenantId");
CREATE INDEX IF NOT EXISTS "TenantDeviceToken_tenantId_revokedAt_idx"      ON "TenantDeviceToken" ("tenantId", "revokedAt");

DO $$ BEGIN
    ALTER TABLE "TenantDeviceToken" ADD CONSTRAINT "TenantDeviceToken_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "TenantDeviceToken" ADD CONSTRAINT "TenantDeviceToken_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "TenantDeviceToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantDeviceToken" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantDeviceToken";
CREATE POLICY tenant_isolation ON "TenantDeviceToken"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantDeviceToken";
CREATE POLICY tenant_isolation_insert ON "TenantDeviceToken"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TenantDeviceToken";
CREATE POLICY superuser_bypass ON "TenantDeviceToken"
    USING (current_setting('role') != 'app_user');

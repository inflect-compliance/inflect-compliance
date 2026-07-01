-- Epic Regwatch 2A — framework-version delta-gap engine.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "FrameworkDeltaStatus" AS ENUM ('NEW', 'REVIEWED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable FrameworkVersionDiff (GLOBAL — no tenantId, no RLS)
CREATE TABLE IF NOT EXISTS "FrameworkVersionDiff" (
    "id" TEXT NOT NULL,
    "frameworkKey" TEXT NOT NULL,
    "fromVersion" TEXT NOT NULL,
    "toVersion" TEXT NOT NULL,
    "addedCodesJson" TEXT NOT NULL DEFAULT '[]',
    "changedCodesJson" TEXT NOT NULL DEFAULT '[]',
    "removedCodesJson" TEXT NOT NULL DEFAULT '[]',
    "changelog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FrameworkVersionDiff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FrameworkVersionDiff_frameworkKey_fromVersion_toVersion_key" ON "FrameworkVersionDiff" ("frameworkKey", "fromVersion", "toVersion");
CREATE INDEX IF NOT EXISTS "FrameworkVersionDiff_frameworkKey_createdAt_idx" ON "FrameworkVersionDiff" ("frameworkKey", "createdAt");

-- CreateTable TenantFrameworkDelta (tenant-scoped)
CREATE TABLE IF NOT EXISTS "TenantFrameworkDelta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "diffId" TEXT NOT NULL,
    "frameworkKey" TEXT NOT NULL,
    "fromVersion" TEXT NOT NULL,
    "toVersion" TEXT NOT NULL,
    "newGapCodesJson" TEXT NOT NULL DEFAULT '[]',
    "flaggedControlIdsJson" TEXT NOT NULL DEFAULT '[]',
    "newGapCount" INTEGER NOT NULL DEFAULT 0,
    "flaggedControlCount" INTEGER NOT NULL DEFAULT 0,
    "status" "FrameworkDeltaStatus" NOT NULL DEFAULT 'NEW',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantFrameworkDelta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TenantFrameworkDelta_tenantId_diffId_key" ON "TenantFrameworkDelta" ("tenantId", "diffId");
CREATE INDEX IF NOT EXISTS "TenantFrameworkDelta_tenantId_status_createdAt_idx" ON "TenantFrameworkDelta" ("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "TenantFrameworkDelta_diffId_idx" ON "TenantFrameworkDelta" ("diffId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "TenantFrameworkDelta" ADD CONSTRAINT "TenantFrameworkDelta_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "TenantFrameworkDelta" ADD CONSTRAINT "TenantFrameworkDelta_diffId_fkey"
        FOREIGN KEY ("diffId") REFERENCES "FrameworkVersionDiff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Row-Level Security — TenantFrameworkDelta only (FrameworkVersionDiff is global).
ALTER TABLE "TenantFrameworkDelta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantFrameworkDelta" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantFrameworkDelta";
CREATE POLICY tenant_isolation ON "TenantFrameworkDelta"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantFrameworkDelta";
CREATE POLICY tenant_isolation_insert ON "TenantFrameworkDelta"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TenantFrameworkDelta";
CREATE POLICY superuser_bypass ON "TenantFrameworkDelta"
    USING (current_setting('role') != 'app_user');

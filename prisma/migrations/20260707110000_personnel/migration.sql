-- PR-4 — Employee (personnel hub). Tenant-scoped, RLS-protected. Self-FK to
-- the manager. Cloned RLS triple from 20260707100000_connected_identity_account.

-- ─── 1. Enum ───
DO $$ BEGIN
    CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ONBOARDING', 'OFFBOARDING', 'TERMINATED', 'LEAVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Table ───
CREATE TABLE IF NOT EXISTS "Employee" (
    "id"                TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "externalId"        TEXT,
    "fullName"          TEXT NOT NULL,
    "workEmail"         TEXT NOT NULL,
    "status"            "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "department"        TEXT,
    "jobTitle"          TEXT,
    "managerEmployeeId" TEXT,
    "startDate"         TIMESTAMP(3),
    "endDate"           TIMESTAMP(3),
    "source"            TEXT NOT NULL DEFAULT 'MANUAL',
    "syncedAt"          TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_tenantId_workEmail_key" ON "Employee" ("tenantId", "workEmail");
CREATE INDEX IF NOT EXISTS "Employee_tenantId_status_idx"           ON "Employee" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Employee_tenantId_managerEmployeeId_idx" ON "Employee" ("tenantId", "managerEmployeeId");

-- ─── 3. Foreign keys ───
DO $$ BEGIN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerEmployeeId_fkey"
        FOREIGN KEY ("managerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. RLS (standard non-nullable-tenant triple) ───
ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Employee" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "Employee";
CREATE POLICY tenant_isolation ON "Employee"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Employee";
CREATE POLICY tenant_isolation_insert ON "Employee"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "Employee";
CREATE POLICY superuser_bypass ON "Employee"
    USING (current_setting('role') != 'app_user');

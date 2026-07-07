-- PR-6 — TrainingCourse + TrainingAssignment + BackgroundCheck. All
-- tenant-scoped, RLS-protected. BackgroundCheck.resultSummary is encrypted at
-- the app layer (Epic B manifest), stored as ciphertext text.

-- ─── 1. Enums ───
DO $$ BEGIN
    CREATE TYPE "TrainingStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE "BackgroundCheckStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'CLEAR', 'CONSIDER', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. TrainingCourse ───
CREATE TABLE IF NOT EXISTS "TrainingCourse" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "provider"    TEXT,
    "cadenceDays" INTEGER DEFAULT 365,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingCourse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrainingCourse_tenantId_name_key" ON "TrainingCourse" ("tenantId", "name");
CREATE INDEX IF NOT EXISTS "TrainingCourse_tenantId_idx"             ON "TrainingCourse" ("tenantId");
DO $$ BEGIN
    ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. TrainingAssignment ───
CREATE TABLE IF NOT EXISTS "TrainingAssignment" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "employeeId"  TEXT NOT NULL,
    "courseId"    TEXT NOT NULL,
    "status"      "TrainingStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt"       TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TrainingAssignment_tenantId_employeeId_idx" ON "TrainingAssignment" ("tenantId", "employeeId");
CREATE INDEX IF NOT EXISTS "TrainingAssignment_tenantId_status_idx"     ON "TrainingAssignment" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "TrainingAssignment_tenantId_courseId_idx"   ON "TrainingAssignment" ("tenantId", "courseId");
DO $$ BEGIN
    ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_courseId_fkey"
        FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. BackgroundCheck ───
CREATE TABLE IF NOT EXISTS "BackgroundCheck" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "employeeId"    TEXT NOT NULL,
    "provider"      TEXT,
    "status"        "BackgroundCheckStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt"   TIMESTAMP(3),
    "completedAt"   TIMESTAMP(3),
    "resultSummary" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BackgroundCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BackgroundCheck_tenantId_employeeId_idx" ON "BackgroundCheck" ("tenantId", "employeeId");
CREATE INDEX IF NOT EXISTS "BackgroundCheck_tenantId_status_idx"     ON "BackgroundCheck" ("tenantId", "status");
DO $$ BEGIN
    ALTER TABLE "BackgroundCheck" ADD CONSTRAINT "BackgroundCheck_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "BackgroundCheck" ADD CONSTRAINT "BackgroundCheck_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. RLS (standard triple, all three tables) ───
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['TrainingCourse','TrainingAssignment','BackgroundCheck'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)::text)', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I', t);
        EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true)::text)', t);
        EXECUTE format('DROP POLICY IF EXISTS superuser_bypass ON %I', t);
        EXECUTE format('CREATE POLICY superuser_bypass ON %I USING (current_setting(''role'') != ''app_user'')', t);
    END LOOP;
END $$;

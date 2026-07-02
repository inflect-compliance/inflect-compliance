-- NIS2 gap-assessment multi-respondent delegation: partition a STANDALONE run's
-- questions into disjoint per-role buckets. Answers stay on the parent
-- Nis2SelfAssessmentAnswer table (single source) — assignments only own ids.

CREATE TABLE IF NOT EXISTS "Nis2GapAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "respondentRole" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "questionIds" TEXT[],
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Nis2GapAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Nis2GapAssignment_tenantId_assessmentId_idx" ON "Nis2GapAssignment"("tenantId", "assessmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Nis2GapAssignment_assessmentId_respondentRole_key" ON "Nis2GapAssignment"("assessmentId", "respondentRole");
CREATE INDEX IF NOT EXISTS "Nis2GapAssignment_tenantId_assigneeUserId_idx" ON "Nis2GapAssignment"("tenantId", "assigneeUserId");

DO $$ BEGIN
    ALTER TABLE "Nis2GapAssignment" ADD CONSTRAINT "Nis2GapAssignment_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "Nis2GapAssignment" ADD CONSTRAINT "Nis2GapAssignment_assessmentId_fkey"
        FOREIGN KEY ("assessmentId") REFERENCES "Nis2SelfAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Row-Level Security (tenant-scoped).
ALTER TABLE "Nis2GapAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Nis2GapAssignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Nis2GapAssignment";
CREATE POLICY tenant_isolation ON "Nis2GapAssignment"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Nis2GapAssignment";
CREATE POLICY tenant_isolation_insert ON "Nis2GapAssignment"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "Nis2GapAssignment";
CREATE POLICY superuser_bypass ON "Nis2GapAssignment"
    USING (current_setting('role') != 'app_user');

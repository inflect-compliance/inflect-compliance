
-- CreateTable
CREATE TABLE "Nis2GapDomain" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "day" INTEGER NOT NULL,

    CONSTRAINT "Nis2GapDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nis2GapQuestion" (
    "id" TEXT NOT NULL,
    "domainId" INTEGER NOT NULL,
    "text" JSONB NOT NULL,
    "plainText" JSONB NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "criticality" TEXT NOT NULL,
    "respondent" TEXT NOT NULL,
    "consequence" TEXT NOT NULL,
    "fineExposure" BOOLEAN NOT NULL,
    "timeToFix" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "dependsOn" TEXT[],

    CONSTRAINT "Nis2GapQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nis2SelfAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nis2SelfAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nis2SelfAssessmentAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "note" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nis2SelfAssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Nis2GapDomain_code_key" ON "Nis2GapDomain"("code");

-- CreateIndex
CREATE INDEX "Nis2GapQuestion_domainId_idx" ON "Nis2GapQuestion"("domainId");

-- CreateIndex
CREATE INDEX "Nis2SelfAssessment_tenantId_updatedAt_idx" ON "Nis2SelfAssessment"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "Nis2SelfAssessmentAnswer_tenantId_assessmentId_idx" ON "Nis2SelfAssessmentAnswer"("tenantId", "assessmentId");

-- CreateIndex
CREATE INDEX "Nis2SelfAssessmentAnswer_questionId_idx" ON "Nis2SelfAssessmentAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Nis2SelfAssessmentAnswer_assessmentId_questionId_key" ON "Nis2SelfAssessmentAnswer"("assessmentId", "questionId");

-- AddForeignKey
ALTER TABLE "Nis2GapQuestion" ADD CONSTRAINT "Nis2GapQuestion_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Nis2GapDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nis2SelfAssessment" ADD CONSTRAINT "Nis2SelfAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nis2SelfAssessmentAnswer" ADD CONSTRAINT "Nis2SelfAssessmentAnswer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nis2SelfAssessmentAnswer" ADD CONSTRAINT "Nis2SelfAssessmentAnswer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Nis2SelfAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nis2SelfAssessmentAnswer" ADD CONSTRAINT "Nis2SelfAssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Nis2GapQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════
-- Row-Level Security (Epic A.1)
-- ═══════════════════════════════════════════════════════════════════
-- Nis2GapDomain + Nis2GapQuestion are GLOBAL reference tables (shared
-- library content, no tenantId) — like PolicyTemplate they get NO
-- tenant RLS, only the app_user read/write grant.
-- Nis2SelfAssessment + Nis2SelfAssessmentAnswer are tenant-scoped and
-- carry the canonical tenant_isolation + tenant_isolation_insert +
-- superuser_bypass policies under FORCE ROW LEVEL SECURITY.

-- 1) app_user grants (all four new tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON "Nis2GapDomain" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Nis2GapQuestion" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Nis2SelfAssessment" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Nis2SelfAssessmentAnswer" TO app_user;

-- 2) Enable + FORCE RLS on the tenant-scoped tables
ALTER TABLE "Nis2SelfAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Nis2SelfAssessment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Nis2SelfAssessmentAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Nis2SelfAssessmentAnswer" FORCE ROW LEVEL SECURITY;

-- 3) tenant_isolation (USING) + tenant_isolation_insert (WITH CHECK)
DROP POLICY IF EXISTS tenant_isolation ON "Nis2SelfAssessment";
CREATE POLICY tenant_isolation ON "Nis2SelfAssessment"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Nis2SelfAssessment";
CREATE POLICY tenant_isolation_insert ON "Nis2SelfAssessment"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS tenant_isolation ON "Nis2SelfAssessmentAnswer";
CREATE POLICY tenant_isolation ON "Nis2SelfAssessmentAnswer"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Nis2SelfAssessmentAnswer";
CREATE POLICY tenant_isolation_insert ON "Nis2SelfAssessmentAnswer"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- 4) superuser_bypass — non-app_user roles (postgres) keep full access
DROP POLICY IF EXISTS superuser_bypass ON "Nis2SelfAssessment";
CREATE POLICY superuser_bypass ON "Nis2SelfAssessment"
    USING (current_setting('role') != 'app_user');
DROP POLICY IF EXISTS superuser_bypass ON "Nis2SelfAssessmentAnswer";
CREATE POLICY superuser_bypass ON "Nis2SelfAssessmentAnswer"
    USING (current_setting('role') != 'app_user');

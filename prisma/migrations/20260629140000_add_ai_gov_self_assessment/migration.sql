-- AI-Governance Self-Assessment (unified AISVS / ISO 42001 / EU AI Act).
-- Mirrors the NIS2 gap-assessment migration: 2 global reference tables
-- (no RLS) + 2 tenant-scoped tables (full RLS).

-- ─── Tables ──────────────────────────────────────────────────────────
CREATE TABLE "AiGovDomain" (
    "id"   INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "AiGovDomain_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiGovQuestion" (
    "id"           TEXT NOT NULL,
    "domainId"     INTEGER NOT NULL,
    "text"         TEXT NOT NULL,
    "mappingsJson" JSONB NOT NULL,
    "conditional"  TEXT,
    "criticality"  TEXT NOT NULL,
    CONSTRAINT "AiGovQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiGovSelfAssessment" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "title"              TEXT,
    "status"             TEXT NOT NULL DEFAULT 'DRAFT',
    "questionSetVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById"        TEXT,
    "startedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"        TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiGovSelfAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiGovSelfAssessmentAnswer" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId"   TEXT NOT NULL,
    "answer"       TEXT NOT NULL,
    "note"         TEXT,
    "answeredById" TEXT,
    "answeredAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiGovSelfAssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ─────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "AiGovDomain_code_key" ON "AiGovDomain"("code");
CREATE INDEX "AiGovQuestion_domainId_idx" ON "AiGovQuestion"("domainId");
CREATE INDEX "AiGovSelfAssessment_tenantId_updatedAt_idx" ON "AiGovSelfAssessment"("tenantId", "updatedAt");
CREATE INDEX "AiGovSelfAssessmentAnswer_tenantId_assessmentId_idx" ON "AiGovSelfAssessmentAnswer"("tenantId", "assessmentId");
CREATE INDEX "AiGovSelfAssessmentAnswer_questionId_idx" ON "AiGovSelfAssessmentAnswer"("questionId");
CREATE UNIQUE INDEX "AiGovSelfAssessmentAnswer_assessmentId_questionId_key" ON "AiGovSelfAssessmentAnswer"("assessmentId", "questionId");

-- ─── Foreign keys ────────────────────────────────────────────────────
ALTER TABLE "AiGovQuestion" ADD CONSTRAINT "AiGovQuestion_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "AiGovDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiGovSelfAssessment" ADD CONSTRAINT "AiGovSelfAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiGovSelfAssessmentAnswer" ADD CONSTRAINT "AiGovSelfAssessmentAnswer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiGovSelfAssessmentAnswer" ADD CONSTRAINT "AiGovSelfAssessmentAnswer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AiGovSelfAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiGovSelfAssessmentAnswer" ADD CONSTRAINT "AiGovSelfAssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AiGovQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Row-Level Security (Epic A.1)
-- ═══════════════════════════════════════════════════════════════════
-- AiGovDomain + AiGovQuestion are GLOBAL reference tables (no tenantId) —
-- no tenant RLS, only the app_user grant. AiGovSelfAssessment + …Answer are
-- tenant-scoped: canonical tenant_isolation + tenant_isolation_insert +
-- superuser_bypass under FORCE ROW LEVEL SECURITY.

-- 1) app_user grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiGovDomain" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiGovQuestion" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiGovSelfAssessment" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiGovSelfAssessmentAnswer" TO app_user;

-- 2) Enable + FORCE RLS on the tenant-scoped tables
ALTER TABLE "AiGovSelfAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiGovSelfAssessment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AiGovSelfAssessmentAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiGovSelfAssessmentAnswer" FORCE ROW LEVEL SECURITY;

-- 3) tenant_isolation (USING) + tenant_isolation_insert (WITH CHECK)
DROP POLICY IF EXISTS tenant_isolation ON "AiGovSelfAssessment";
CREATE POLICY tenant_isolation ON "AiGovSelfAssessment"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AiGovSelfAssessment";
CREATE POLICY tenant_isolation_insert ON "AiGovSelfAssessment"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS tenant_isolation ON "AiGovSelfAssessmentAnswer";
CREATE POLICY tenant_isolation ON "AiGovSelfAssessmentAnswer"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AiGovSelfAssessmentAnswer";
CREATE POLICY tenant_isolation_insert ON "AiGovSelfAssessmentAnswer"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- 4) superuser_bypass — non-app_user roles (postgres) keep full access
DROP POLICY IF EXISTS superuser_bypass ON "AiGovSelfAssessment";
CREATE POLICY superuser_bypass ON "AiGovSelfAssessment"
    USING (current_setting('role') != 'app_user');
DROP POLICY IF EXISTS superuser_bypass ON "AiGovSelfAssessmentAnswer";
CREATE POLICY superuser_bypass ON "AiGovSelfAssessmentAnswer"
    USING (current_setting('role') != 'app_user');

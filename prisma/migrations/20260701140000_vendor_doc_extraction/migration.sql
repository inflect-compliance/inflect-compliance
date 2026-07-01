-- Vendor-document AI extraction → assessment pre-fill (propose-not-commit).
-- Two tenant-scoped tables mirroring RiskSuggestionSession/Item: an
-- extraction "session" + per-question proposals a human reviews before they
-- land as real VendorAssessmentAnswers. Canonical non-nullable-tenant RLS.

-- ─── 1. VendorDocExtraction ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VendorDocExtraction" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "vendorId"         TEXT NOT NULL,
    "documentId"       TEXT NOT NULL,
    "assessmentId"     TEXT,
    "status"           TEXT NOT NULL DEFAULT 'PENDING',
    "provider"         TEXT NOT NULL DEFAULT 'stub',
    "modelName"        TEXT,
    "reportType"       TEXT,
    "auditPeriodStart" TIMESTAMP(3),
    "auditPeriodEnd"   TIMESTAMP(3),
    "scope"            TEXT,
    "auditor"          TEXT,
    "extractionJson"   JSONB,
    "errorMessage"     TEXT,
    "createdByUserId"  TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorDocExtraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VendorDocExtraction_tenantId_vendorId_idx"   ON "VendorDocExtraction" ("tenantId", "vendorId");
CREATE INDEX IF NOT EXISTS "VendorDocExtraction_tenantId_status_idx"     ON "VendorDocExtraction" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "VendorDocExtraction_tenantId_documentId_idx" ON "VendorDocExtraction" ("tenantId", "documentId");

-- ─── 2. VendorAnswerProposal ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VendorAnswerProposal" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "extractionId"       TEXT NOT NULL,
    "assessmentId"       TEXT,
    "questionId"         TEXT,
    "templateQuestionId" TEXT,
    "proposedAnswerJson" JSONB NOT NULL,
    "confidence"         TEXT NOT NULL DEFAULT 'medium',
    "sourceCitation"     TEXT NOT NULL,
    "status"             TEXT NOT NULL DEFAULT 'PENDING',
    "createdAnswerId"    TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorAnswerProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VendorAnswerProposal_tenantId_extractionId_idx" ON "VendorAnswerProposal" ("tenantId", "extractionId");
CREATE INDEX IF NOT EXISTS "VendorAnswerProposal_tenantId_status_idx"       ON "VendorAnswerProposal" ("tenantId", "status");

-- ─── 3. Foreign keys ────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE "VendorDocExtraction" ADD CONSTRAINT "VendorDocExtraction_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "VendorDocExtraction" ADD CONSTRAINT "VendorDocExtraction_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "VendorDocExtraction" ADD CONSTRAINT "VendorDocExtraction_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "VendorDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "VendorDocExtraction" ADD CONSTRAINT "VendorDocExtraction_createdByUserId_fkey"
        FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "VendorAnswerProposal" ADD CONSTRAINT "VendorAnswerProposal_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "VendorAnswerProposal" ADD CONSTRAINT "VendorAnswerProposal_extractionId_fkey"
        FOREIGN KEY ("extractionId") REFERENCES "VendorDocExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. RLS (standard non-nullable-tenant triple) ───────────────────
ALTER TABLE "VendorDocExtraction"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorDocExtraction"  FORCE ROW LEVEL SECURITY;
ALTER TABLE "VendorAnswerProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorAnswerProposal" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "VendorDocExtraction";
CREATE POLICY tenant_isolation ON "VendorDocExtraction"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "VendorDocExtraction";
CREATE POLICY tenant_isolation_insert ON "VendorDocExtraction"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "VendorDocExtraction";
CREATE POLICY superuser_bypass ON "VendorDocExtraction"
    USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS tenant_isolation ON "VendorAnswerProposal";
CREATE POLICY tenant_isolation ON "VendorAnswerProposal"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "VendorAnswerProposal";
CREATE POLICY tenant_isolation_insert ON "VendorAnswerProposal"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "VendorAnswerProposal";
CREATE POLICY superuser_bypass ON "VendorAnswerProposal"
    USING (current_setting('role') != 'app_user');

-- PR-9 — inbound security questionnaire autofill: answer library + parsed
-- questionnaires + items. All tenant-scoped, RLS.

DO $$ BEGIN
    CREATE TYPE "InboundQuestionnaireStatus" AS ENUM ('UPLOADED', 'DRAFTING', 'REVIEW', 'EXPORTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE "QuestionnaireItemStatus" AS ENUM ('PENDING', 'DRAFTED', 'FLAGGED', 'ACCEPTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── QuestionnaireAnswerLibrary ───
CREATE TABLE IF NOT EXISTS "QuestionnaireAnswerLibrary" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "questionText"   TEXT NOT NULL,
    "answerText"     TEXT NOT NULL,
    "sourceRefsJson" JSONB NOT NULL DEFAULT '[]',
    "confidence"     DOUBLE PRECISION,
    "useCount"       INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionnaireAnswerLibrary_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuestionnaireAnswerLibrary_tenantId_idx" ON "QuestionnaireAnswerLibrary" ("tenantId");
DO $$ BEGIN
    ALTER TABLE "QuestionnaireAnswerLibrary" ADD CONSTRAINT "QuestionnaireAnswerLibrary_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── InboundQuestionnaire ───
CREATE TABLE IF NOT EXISTS "InboundQuestionnaire" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "source"          TEXT,
    "status"          "InboundQuestionnaireStatus" NOT NULL DEFAULT 'UPLOADED',
    "itemCount"       INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboundQuestionnaire_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InboundQuestionnaire_tenantId_status_idx" ON "InboundQuestionnaire" ("tenantId", "status");
DO $$ BEGIN
    ALTER TABLE "InboundQuestionnaire" ADD CONSTRAINT "InboundQuestionnaire_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── InboundQuestionnaireItem ───
CREATE TABLE IF NOT EXISTS "InboundQuestionnaireItem" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "order"           INTEGER NOT NULL DEFAULT 0,
    "questionText"    TEXT NOT NULL,
    "draftAnswer"     TEXT,
    "confidence"      DOUBLE PRECISION,
    "sourceCitation"  TEXT,
    "status"          "QuestionnaireItemStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAnswer"  TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboundQuestionnaireItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InboundQuestionnaireItem_tenantId_questionnaireId_idx" ON "InboundQuestionnaireItem" ("tenantId", "questionnaireId");
CREATE INDEX IF NOT EXISTS "InboundQuestionnaireItem_tenantId_status_idx"          ON "InboundQuestionnaireItem" ("tenantId", "status");
DO $$ BEGIN
    ALTER TABLE "InboundQuestionnaireItem" ADD CONSTRAINT "InboundQuestionnaireItem_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "InboundQuestionnaireItem" ADD CONSTRAINT "InboundQuestionnaireItem_questionnaireId_fkey"
        FOREIGN KEY ("questionnaireId") REFERENCES "InboundQuestionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── RLS (standard triple, all three) ───
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['QuestionnaireAnswerLibrary','InboundQuestionnaire','InboundQuestionnaireItem'] LOOP
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

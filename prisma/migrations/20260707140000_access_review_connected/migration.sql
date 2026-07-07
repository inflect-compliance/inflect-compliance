-- PR-7 — CONNECTED_APP access-review scope + AccessReviewConnectedDecision.
-- Additive: the mature member-review model (AccessReviewDecision) is untouched.

-- ─── 1. Enum value ───
DO $$ BEGIN
    ALTER TYPE "AccessReviewScope" ADD VALUE IF NOT EXISTS 'CONNECTED_APP';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Table ───
CREATE TABLE IF NOT EXISTS "AccessReviewConnectedDecision" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "accessReviewId"     TEXT NOT NULL,
    "connectedAccountId" TEXT,
    "subjectRef"         TEXT NOT NULL,
    "snapshotJson"       JSONB NOT NULL,
    "decision"           "AccessReviewDecisionType",
    "decidedAt"          TIMESTAMP(3),
    "decidedByUserId"    TEXT,
    "notes"              TEXT,
    "executedAt"         TIMESTAMP(3),
    "executedByUserId"   TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccessReviewConnectedDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccessReviewConnectedDecision_accessReviewId_subjectRef_key" ON "AccessReviewConnectedDecision" ("accessReviewId", "subjectRef");
CREATE INDEX IF NOT EXISTS "AccessReviewConnectedDecision_tenantId_idx"                          ON "AccessReviewConnectedDecision" ("tenantId");
CREATE INDEX IF NOT EXISTS "AccessReviewConnectedDecision_tenantId_accessReviewId_idx"           ON "AccessReviewConnectedDecision" ("tenantId", "accessReviewId");

-- ─── 3. Foreign keys ───
DO $$ BEGIN
    ALTER TABLE "AccessReviewConnectedDecision" ADD CONSTRAINT "AccessReviewConnectedDecision_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "AccessReviewConnectedDecision" ADD CONSTRAINT "AccessReviewConnectedDecision_accessReviewId_tenantId_fkey"
        FOREIGN KEY ("accessReviewId", "tenantId") REFERENCES "AccessReview"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "AccessReviewConnectedDecision" ADD CONSTRAINT "AccessReviewConnectedDecision_connectedAccountId_fkey"
        FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedIdentityAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "AccessReviewConnectedDecision" ADD CONSTRAINT "AccessReviewConnectedDecision_decidedByUserId_fkey"
        FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. RLS (standard non-nullable-tenant triple) ───
ALTER TABLE "AccessReviewConnectedDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessReviewConnectedDecision" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AccessReviewConnectedDecision";
CREATE POLICY tenant_isolation ON "AccessReviewConnectedDecision"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AccessReviewConnectedDecision";
CREATE POLICY tenant_isolation_insert ON "AccessReviewConnectedDecision"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AccessReviewConnectedDecision";
CREATE POLICY superuser_bypass ON "AccessReviewConnectedDecision"
    USING (current_setting('role') != 'app_user');

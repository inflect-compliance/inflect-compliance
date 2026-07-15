-- PolicyAcknowledgementAssignment — required-acknowledgement campaign (Prompt-1).
-- Ownership-chained child of PolicyVersion (no tenantId column), so it mirrors
-- PolicyAcknowledgement's RLS: an EXISTS-on-PolicyVersion.tenantId policy.

CREATE TABLE "PolicyAcknowledgementAssignment" (
    "id"              TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "assignedById"    TEXT NOT NULL,
    "assignedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcknowledgementAssignment_pkey" PRIMARY KEY ("id")
);

-- One requirement per (version, user); also serves as the policyVersionId-leading
-- index for the roster query.
CREATE UNIQUE INDEX "PolicyAcknowledgementAssignment_policyVersionId_userId_key"
    ON "PolicyAcknowledgementAssignment"("policyVersionId", "userId");

ALTER TABLE "PolicyAcknowledgementAssignment"
    ADD CONSTRAINT "PolicyAcknowledgementAssignment_policyVersionId_fkey"
    FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security (ownership-chained via PolicyVersion) ──────────
-- A row is tenant-scoped via PolicyVersion.tenantId — the same shape as
-- PolicyAcknowledgement (see 20260422180000_enable_rls_coverage).
ALTER TABLE "PolicyAcknowledgementAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyAcknowledgementAssignment" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "PolicyAcknowledgementAssignment";
CREATE POLICY tenant_isolation ON "PolicyAcknowledgementAssignment"
    USING (
        EXISTS (
            SELECT 1 FROM "PolicyVersion" pv
            WHERE pv.id = "policyVersionId"
              AND pv."tenantId" = current_setting('app.tenant_id', true)::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "PolicyVersion" pv
            WHERE pv.id = "policyVersionId"
              AND pv."tenantId" = current_setting('app.tenant_id', true)::text
        )
    );

DROP POLICY IF EXISTS superuser_bypass ON "PolicyAcknowledgementAssignment";
CREATE POLICY superuser_bypass ON "PolicyAcknowledgementAssignment"
    USING (current_setting('role') != 'app_user');

GRANT SELECT, INSERT, UPDATE, DELETE ON "PolicyAcknowledgementAssignment" TO app_user;

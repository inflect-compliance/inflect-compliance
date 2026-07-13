-- Vulnerability triage: assign an owner, an optional remediation due date,
-- and link a spawned remediation Task to a matched AssetVulnerability.
-- All three additions are FK / date columns — NO new String content column,
-- so the Epic B encryption manifest is untouched.

-- ─── 1. Columns ───
ALTER TABLE "AssetVulnerability"
    ADD COLUMN IF NOT EXISTS "ownerUserId"       TEXT,
    ADD COLUMN IF NOT EXISTS "remediationDueAt"  TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "remediationTaskId" TEXT;

-- ─── 2. Indexes (schema-index-coverage: tenantId-led owner + FK index) ───
CREATE INDEX IF NOT EXISTS "AssetVulnerability_tenantId_ownerUserId_idx"
    ON "AssetVulnerability" ("tenantId", "ownerUserId");
CREATE INDEX IF NOT EXISTS "AssetVulnerability_remediationTaskId_idx"
    ON "AssetVulnerability" ("remediationTaskId");

-- ─── 3. Foreign keys ───
-- Owner: nullable relation, Prisma default action (SET NULL on delete) so a
-- removed user simply un-owns the vulnerability.
DO $$ BEGIN
    ALTER TABLE "AssetVulnerability" ADD CONSTRAINT "AssetVulnerability_ownerUserId_fkey"
        FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Remediation task: explicit onDelete SetNull — deleting the Task clears the
-- link but never cascade-deletes the vulnerability row.
DO $$ BEGIN
    ALTER TABLE "AssetVulnerability" ADD CONSTRAINT "AssetVulnerability_remediationTaskId_fkey"
        FOREIGN KEY ("remediationTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

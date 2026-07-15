-- EP-3 — evidence↔control many-to-many join.
--
-- Re-uploading the same artifact to N controls used to clone N independent
-- Evidence rows (root cause: the singular `Evidence.controlId`). This
-- migration introduces `EvidenceControlLink` (one Evidence + N join rows),
-- backfills it from the current singular refs, then drops `Evidence.controlId`
-- (forward-fix — no down migration). The Evidence entity becomes the single
-- source of truth for evidence-entity↔control associations; ControlEvidenceLink
-- is retained ONLY for non-Evidence artifacts (url / integrationResult / bia).
--
-- Also lands the Part-4 file-version lineage columns
-- (FileRecord.previousFileRecordId + Evidence.fileVersion) so replacing a
-- doc preserves the Evidence row + chains the prior FileRecord.

-- ─── Part 4: file-version lineage columns ───
ALTER TABLE "Evidence" ADD COLUMN "fileVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "FileRecord" ADD COLUMN "previousFileRecordId" TEXT;
ALTER TABLE "FileRecord" ADD CONSTRAINT "FileRecord_previousFileRecordId_fkey"
    FOREIGN KEY ("previousFileRecordId") REFERENCES "FileRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FileRecord_tenantId_previousFileRecordId_idx" ON "FileRecord"("tenantId", "previousFileRecordId");

-- ─── EvidenceControlLink table ───
CREATE TABLE "EvidenceControlLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceControlLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceControlLink_tenantId_controlId_idx" ON "EvidenceControlLink"("tenantId", "controlId");
CREATE INDEX "EvidenceControlLink_tenantId_evidenceId_idx" ON "EvidenceControlLink"("tenantId", "evidenceId");
CREATE UNIQUE INDEX "EvidenceControlLink_tenantId_evidenceId_controlId_key" ON "EvidenceControlLink"("tenantId", "evidenceId", "controlId");

-- AddForeignKey: composite FK to Evidence(id, tenantId) (CASCADE — chained RLS);
-- control (CASCADE); createdBy (SET NULL); tenant (RESTRICT).
ALTER TABLE "EvidenceControlLink" ADD CONSTRAINT "EvidenceControlLink_evidenceId_tenantId_fkey" FOREIGN KEY ("evidenceId", "tenantId") REFERENCES "Evidence"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceControlLink" ADD CONSTRAINT "EvidenceControlLink_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceControlLink" ADD CONSTRAINT "EvidenceControlLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceControlLink" ADD CONSTRAINT "EvidenceControlLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security for the new tenant junction (canonical trio).
-- New tables inherit app_user grants via ALTER DEFAULT PRIVILEGES.
-- tenantId is NOT nullable → standard symmetric single tenant_isolation policy.
ALTER TABLE "EvidenceControlLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceControlLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EvidenceControlLink"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "EvidenceControlLink"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY superuser_bypass ON "EvidenceControlLink"
    USING (current_setting('role') != 'app_user');

-- ─── Backfill: one link per currently-linked Evidence ───
-- gen_random_uuid()::text ids are fine for backfilled rows (non-cuid, but
-- unique + stable). Only Evidence rows with a non-null controlId map over.
INSERT INTO "EvidenceControlLink" ("id", "tenantId", "evidenceId", "controlId", "createdByUserId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "tenantId", "id", "controlId", NULL, now(), now()
FROM "Evidence"
WHERE "controlId" IS NOT NULL;

-- ─── Drop the singular Evidence.controlId (forward-fix) ───
DROP INDEX IF EXISTS "Evidence_tenantId_controlId_idx";
ALTER TABLE "Evidence" DROP CONSTRAINT IF EXISTS "Evidence_controlId_fkey";
ALTER TABLE "Evidence" DROP COLUMN "controlId";

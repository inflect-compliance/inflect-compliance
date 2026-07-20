-- ═══════════════════════════════════════════════════════════════════
-- Evidence reuse across risks + assets, and evidence tags
-- ═══════════════════════════════════════════════════════════════════
--
-- Evidence↔Control became many-to-many (EvidenceControlLink) precisely
-- because re-uploading the same artifact to N controls cloned N Evidence
-- rows. `Evidence.riskId` / `Evidence.assetId` were left as SINGULAR FKs
-- by that same migration, so the identical cloning problem persisted for
-- risks and assets: one document could not be attached to two risks
-- without a second upload.
--
-- These join tables mirror EvidenceControlLink exactly, including the
-- composite FK `(evidenceId, tenantId) → Evidence(id, tenantId)` which
-- makes a cross-tenant link impossible at the DB level rather than only
-- at the RLS level.
--
-- EvidenceTag adds the second organisation dimension beside `folder`. A
-- join table (not a JSON/array column) keeps the tag filter an indexed
-- lookup, consistent with this schema's direction of travel.
--
-- FORWARD-FIX, per the change-management policy: the singular columns are
-- BACKFILLED into the join tables and then left in place. They are not
-- dropped here — a rollback is redeploying the prior image, which still
-- reads them. A follow-up drops them once no code path reads them.

-- ─── EvidenceRiskLink ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EvidenceRiskLink" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "evidenceId"      TEXT NOT NULL,
    "riskId"          TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EvidenceRiskLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EvidenceRiskLink_tenantId_evidenceId_riskId_key"
    ON "EvidenceRiskLink" ("tenantId", "evidenceId", "riskId");
CREATE INDEX IF NOT EXISTS "EvidenceRiskLink_tenantId_riskId_idx"
    ON "EvidenceRiskLink" ("tenantId", "riskId");
CREATE INDEX IF NOT EXISTS "EvidenceRiskLink_tenantId_evidenceId_idx"
    ON "EvidenceRiskLink" ("tenantId", "evidenceId");

ALTER TABLE "EvidenceRiskLink"
    ADD CONSTRAINT "EvidenceRiskLink_evidenceId_tenantId_fkey"
    FOREIGN KEY ("evidenceId", "tenantId") REFERENCES "Evidence"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceRiskLink"
    ADD CONSTRAINT "EvidenceRiskLink_riskId_fkey"
    FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceRiskLink"
    ADD CONSTRAINT "EvidenceRiskLink_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceRiskLink"
    ADD CONSTRAINT "EvidenceRiskLink_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── EvidenceAssetLink ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EvidenceAssetLink" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "evidenceId"      TEXT NOT NULL,
    "assetId"         TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EvidenceAssetLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EvidenceAssetLink_tenantId_evidenceId_assetId_key"
    ON "EvidenceAssetLink" ("tenantId", "evidenceId", "assetId");
CREATE INDEX IF NOT EXISTS "EvidenceAssetLink_tenantId_assetId_idx"
    ON "EvidenceAssetLink" ("tenantId", "assetId");
CREATE INDEX IF NOT EXISTS "EvidenceAssetLink_tenantId_evidenceId_idx"
    ON "EvidenceAssetLink" ("tenantId", "evidenceId");

ALTER TABLE "EvidenceAssetLink"
    ADD CONSTRAINT "EvidenceAssetLink_evidenceId_tenantId_fkey"
    FOREIGN KEY ("evidenceId", "tenantId") REFERENCES "Evidence"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAssetLink"
    ADD CONSTRAINT "EvidenceAssetLink_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAssetLink"
    ADD CONSTRAINT "EvidenceAssetLink_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceAssetLink"
    ADD CONSTRAINT "EvidenceAssetLink_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── EvidenceTag ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EvidenceTag" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "tag"        TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EvidenceTag_tenantId_evidenceId_tag_key"
    ON "EvidenceTag" ("tenantId", "evidenceId", "tag");
CREATE INDEX IF NOT EXISTS "EvidenceTag_tenantId_tag_idx"
    ON "EvidenceTag" ("tenantId", "tag");
CREATE INDEX IF NOT EXISTS "EvidenceTag_tenantId_evidenceId_idx"
    ON "EvidenceTag" ("tenantId", "evidenceId");

ALTER TABLE "EvidenceTag"
    ADD CONSTRAINT "EvidenceTag_evidenceId_tenantId_fkey"
    FOREIGN KEY ("evidenceId", "tenantId") REFERENCES "Evidence"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceTag"
    ADD CONSTRAINT "EvidenceTag_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Backfill from the singular FKs ─────────────────────────────────
-- Every existing attachment becomes a join row so the new read paths see
-- exactly what the old ones did. Idempotent via ON CONFLICT.
INSERT INTO "EvidenceRiskLink" ("id", "tenantId", "evidenceId", "riskId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."tenantId", e."id", e."riskId", NOW(), NOW()
FROM "Evidence" e
WHERE e."riskId" IS NOT NULL
ON CONFLICT ("tenantId", "evidenceId", "riskId") DO NOTHING;

INSERT INTO "EvidenceAssetLink" ("id", "tenantId", "evidenceId", "assetId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."tenantId", e."id", e."assetId", NOW(), NOW()
FROM "Evidence" e
WHERE e."assetId" IS NOT NULL
ON CONFLICT ("tenantId", "evidenceId", "assetId") DO NOTHING;

-- ─── RLS: the canonical trio, per table ─────────────────────────────
ALTER TABLE "EvidenceRiskLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceRiskLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EvidenceRiskLink"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "EvidenceRiskLink"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY superuser_bypass ON "EvidenceRiskLink"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "EvidenceAssetLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceAssetLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EvidenceAssetLink"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "EvidenceAssetLink"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY superuser_bypass ON "EvidenceAssetLink"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "EvidenceTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceTag" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EvidenceTag"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "EvidenceTag"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY superuser_bypass ON "EvidenceTag"
    USING (current_setting('role') != 'app_user');

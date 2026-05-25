-- Asset.key + AssetKeySequence + ControlKeySequence.
--
-- Asset gets the same `AST-N` per-tenant monotonic key the
-- existing TaskKeySequence + RiskKeySequence pattern minted for
-- Task / Risk. The Assets list page leads with the new Code
-- column.
--
-- Control gets a per-tenant counter for the custom-control
-- (`isCustom = true`) create path that lacks an explicit `code` —
-- framework-installed controls keep their canonical
-- annexId / supplied code and never consume the sequence.

-- ── Asset.key column ────────────────────────────────────────────
ALTER TABLE "Asset" ADD COLUMN "key" TEXT;

-- Postgres treats NULLs as distinct in a UNIQUE index, so historic
-- NULL rows don't collide with each other while we backfill.
CREATE UNIQUE INDEX "Asset_tenantId_key_key" ON "Asset" ("tenantId", "key");

-- ── AssetKeySequence ────────────────────────────────────────────
CREATE TABLE "AssetKeySequence" (
    "tenantId" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AssetKeySequence_pkey" PRIMARY KEY ("tenantId")
);

-- Backfill each tenant's counter from the highest existing AST-N
-- key. Empty on a fresh deploy; non-empty if a prior partial
-- backfill ran. On-conflict-do-nothing makes the migration safe to
-- re-run.
INSERT INTO "AssetKeySequence" ("tenantId", "lastValue")
SELECT "tenantId",
       MAX(CAST(SUBSTRING("key" FROM '^AST-([0-9]+)$') AS INTEGER))
FROM "Asset"
WHERE "key" ~ '^AST-[0-9]+$'
GROUP BY "tenantId"
ON CONFLICT ("tenantId") DO NOTHING;

ALTER TABLE "AssetKeySequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetKeySequence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation        ON "AssetKeySequence";
DROP POLICY IF EXISTS tenant_isolation_insert ON "AssetKeySequence";
CREATE POLICY tenant_isolation ON "AssetKeySequence"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "AssetKeySequence"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AssetKeySequence";
CREATE POLICY superuser_bypass ON "AssetKeySequence"
    USING (current_setting('role') != 'app_user');

-- ── ControlKeySequence ──────────────────────────────────────────
-- Same shape as the asset/risk/task counters. Backfill from the
-- highest existing CTL-N custom-control code (framework-installed
-- controls use their annexId / catalogue code and never match).
CREATE TABLE "ControlKeySequence" (
    "tenantId" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ControlKeySequence_pkey" PRIMARY KEY ("tenantId")
);

INSERT INTO "ControlKeySequence" ("tenantId", "lastValue")
SELECT "tenantId",
       MAX(CAST(SUBSTRING("code" FROM '^CTL-([0-9]+)$') AS INTEGER))
FROM "Control"
WHERE "tenantId" IS NOT NULL AND "code" ~ '^CTL-[0-9]+$'
GROUP BY "tenantId"
ON CONFLICT ("tenantId") DO NOTHING;

ALTER TABLE "ControlKeySequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ControlKeySequence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation        ON "ControlKeySequence";
DROP POLICY IF EXISTS tenant_isolation_insert ON "ControlKeySequence";
CREATE POLICY tenant_isolation ON "ControlKeySequence"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "ControlKeySequence"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ControlKeySequence";
CREATE POLICY superuser_bypass ON "ControlKeySequence"
    USING (current_setting('role') != 'app_user');

-- PR-B — Risk.key column + per-tenant RiskKeySequence counter.
--
-- Mirrors the TaskKeySequence pattern (20260520190000) — every
-- entity that the user-facing list page leads with a scannable
-- code converges on the same shape:
--   • A nullable per-row `key` column ('RSK-1', 'RSK-2', ...).
--   • A per-tenant monotonic counter table for race-free minting.
--   • A `@@unique([tenantId, key])` index on the entity so two
--     concurrent inserts can never produce the same code.
--   • RLS Class A on the counter so cross-tenant peeks are
--     impossible from the app role.

-- Risk.key ---------------------------------------------------------

ALTER TABLE "Risk" ADD COLUMN "key" TEXT;

-- Postgres treats NULLs as distinct in a UNIQUE index, so historic
-- NULL rows don't collide with each other.
CREATE UNIQUE INDEX "Risk_tenantId_key_key" ON "Risk" ("tenantId", "key");

-- RiskKeySequence --------------------------------------------------

CREATE TABLE "RiskKeySequence" (
    "tenantId" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RiskKeySequence_pkey" PRIMARY KEY ("tenantId")
);

-- Backfill — seed each tenant's counter from the highest existing
-- `RSK-N` key (empty on a fresh deploy; non-empty if a prior partial
-- backfill ran). On-conflict-do-nothing makes the migration safe to
-- re-run.
INSERT INTO "RiskKeySequence" ("tenantId", "lastValue")
SELECT "tenantId",
       MAX(CAST(SUBSTRING("key" FROM '^RSK-([0-9]+)$') AS INTEGER))
FROM "Risk"
WHERE "key" ~ '^RSK-[0-9]+$'
GROUP BY "tenantId"
ON CONFLICT ("tenantId") DO NOTHING;

-- RLS — Class A tenant isolation on the counter (matches
-- TaskKeySequence).
ALTER TABLE "RiskKeySequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskKeySequence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation        ON "RiskKeySequence";
DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskKeySequence";
CREATE POLICY tenant_isolation ON "RiskKeySequence"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "RiskKeySequence"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "RiskKeySequence";
CREATE POLICY superuser_bypass ON "RiskKeySequence"
    USING (current_setting('role') != 'app_user');

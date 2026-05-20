-- #102 item 2 — TaskKeySequence.
--
-- A per-tenant monotonic counter for minting `TSK-N` work-item keys,
-- replacing the `db.task.count()` derivation in
-- `WorkItemRepository.create`. The count raced against the unique
-- `[tenantId, key]` index under concurrent imports and scaled
-- linearly with tenant size. An `upsert` with an atomic `increment`
-- (native `INSERT … ON CONFLICT DO UPDATE`) is race-free.

-- CreateTable
CREATE TABLE "TaskKeySequence" (
    "tenantId" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TaskKeySequence_pkey" PRIMARY KEY ("tenantId")
);

-- Backfill — seed each tenant's counter from the highest existing
-- `TSK-N` key. Runs BEFORE RLS is enabled so it is unaffected by the
-- tenant-isolation policy. Tenants with no TSK-keyed tasks get no
-- row; it is created lazily on their first task create.
INSERT INTO "TaskKeySequence" ("tenantId", "lastValue")
SELECT "tenantId",
       MAX(CAST(SUBSTRING("key" FROM '^TSK-([0-9]+)$') AS INTEGER))
FROM "Task"
WHERE "key" ~ '^TSK-[0-9]+$'
GROUP BY "tenantId"
ON CONFLICT ("tenantId") DO NOTHING;

-- RLS — Class A tenant isolation (canonical three-policy shape:
-- tenant_isolation USING + tenant_isolation_insert WITH CHECK +
-- superuser_bypass, with FORCE ROW LEVEL SECURITY).
ALTER TABLE "TaskKeySequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskKeySequence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation        ON "TaskKeySequence";
DROP POLICY IF EXISTS tenant_isolation_insert ON "TaskKeySequence";
CREATE POLICY tenant_isolation ON "TaskKeySequence"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "TaskKeySequence"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TaskKeySequence";
CREATE POLICY superuser_bypass ON "TaskKeySequence"
    USING (current_setting('role') != 'app_user');

-- PR-X — Asset.tags and Asset.retentionUntil were orphan columns: written by no
-- form or import path and read by no code (the surfaced free-text `retention`
-- is the single retention concept). Drop both so the schema stops carrying two
-- "retention" models and a dead tags column. No data migration — the columns
-- never received application writes.
ALTER TABLE "Asset" DROP COLUMN IF EXISTS "tags";
ALTER TABLE "Asset" DROP COLUMN IF EXISTS "retentionUntil";

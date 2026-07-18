-- PR-X — Asset.tags was an orphan column: written by no form or import path and
-- read by no code. Drop it. (Asset.retentionUntil is NOT dropped — it is
-- load-bearing for the generic data-lifecycle retention sweep and is now
-- surfaced as a structured date on the asset form.)
ALTER TABLE "Asset" DROP COLUMN IF EXISTS "tags";

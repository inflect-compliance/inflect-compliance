-- Asset KPI columns on the daily ComplianceSnapshot row.
-- Lets the Assets-page KPI cards render a real per-24hr trend
-- (one frozen point per day) instead of a client-side cumulative
-- approximation. Additive + NOT NULL DEFAULT 0 — backfills existing
-- rows to 0; the daily compliance-snapshot job populates new rows.

-- AlterTable
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "assetsTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "assetsActive" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "assetsHighCriticality" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "assetsRetired" INTEGER NOT NULL DEFAULT 0;

-- KPI sparklines PR3 (Part B) — Test-plan total + status buckets on the daily
-- ComplianceSnapshot, for the new Tests KPI card row.
--
-- `testPlansTotal` is NOT NULL DEFAULT 0 (it anchors the leading-zero trim, like
-- every other entity total). The status buckets are NULLABLE (no DEFAULT) so
-- pre-existence rows read NULL ("no data, don't plot") instead of a false 0 —
-- forward-only fill, no backfill, no fake ramp. See src/lib/charts/kpi-trends.ts.
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "testPlansTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "testPlansActive" INTEGER;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "testPlansPaused" INTEGER;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "testPlansArchived" INTEGER;

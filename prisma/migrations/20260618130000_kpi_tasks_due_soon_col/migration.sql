-- KPI sparklines — Tasks "Due this week" daily series on the ComplianceSnapshot.
--
-- NULLABLE (no DEFAULT): existing rows read NULL ("no data, don't plot") rather
-- than a false 0. The forward-only fill is paired with a one-off backfill that
-- seeds historical rows with the current value so the sparkline shows
-- immediately (see scripts/backfill-kpi-snapshot-cols.ts). The chart pipeline
-- (src/lib/charts/kpi-trends.ts) trims any leading NULL prefix regardless.
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "tasksDueSoon7d" INTEGER;

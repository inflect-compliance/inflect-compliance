-- KPI sparklines PR3 (Part A) — Risk avgScore + overdue-review on the daily
-- ComplianceSnapshot, for the Risk KPI cards that had no daily series.
--
-- NULLABLE (no DEFAULT) on purpose: existing snapshot rows read NULL
-- ("no data, don't plot") rather than a false 0, so the new sparklines fill
-- forward-only from the daily job with NO backfill and NO fake ramp. The
-- chart pipeline (src/lib/charts/kpi-trends.ts) trims the leading NULL prefix.
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "risksAvgScore" DOUBLE PRECISION;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "risksOverdueReview" INTEGER;

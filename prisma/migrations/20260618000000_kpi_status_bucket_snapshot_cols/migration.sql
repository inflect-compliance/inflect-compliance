-- KPI sparklines PR2 — status/criticality bucket counts on the daily
-- ComplianceSnapshot, for the entity KPI cards that the snapshot didn't track.
--
-- NULLABLE (no DEFAULT) on purpose: existing snapshot rows read NULL
-- ("no data, don't plot") rather than a false 0, so the new sparklines fill
-- forward-only from the daily job with NO backfill and NO fake ramp. The
-- chart pipeline (src/lib/charts/kpi-trends.ts) trims the leading NULL prefix.
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "evidenceDraft" INTEGER;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "evidenceSubmitted" INTEGER;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "evidenceApproved" INTEGER;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "policiesDraft" INTEGER;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "policiesInReview" INTEGER;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "policiesApproved" INTEGER;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "vendorsActive" INTEGER;
ALTER TABLE "ComplianceSnapshot" ADD COLUMN "vendorsCritical" INTEGER;

-- P2.1 — assessment-review writeback stamp on Vendor. The G-3 review flow
-- sets Vendor.inherentRisk from the assessment's derived rating on review;
-- this records when that last happened (distinct from nextReviewAt, the
-- manual review-cadence date). Drives the reassessment-overdue metric and
-- the highRiskNoAssessment / activation-gate checks.
ALTER TABLE "Vendor" ADD COLUMN "lastAssessmentReviewedAt" TIMESTAMP(3);

-- P2.4 — reverse "where-used" index. VendorLink's only index leads with
-- vendorId (vendor→entity). listByEntity / the LinkedVendorsPanel query the
-- other direction (given a risk/control/asset, which vendors link to it), so
-- add a (tenantId, entityType, entityId)-leading index.
CREATE INDEX "VendorLink_tenantId_entityType_entityId_idx" ON "VendorLink"("tenantId", "entityType", "entityId");

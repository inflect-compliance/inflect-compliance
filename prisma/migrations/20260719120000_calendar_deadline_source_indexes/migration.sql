-- ═══════════════════════════════════════════════════════════════════
-- Compliance calendar — indexes for the newly aggregated deadline sources
-- ═══════════════════════════════════════════════════════════════════
--
-- The calendar gained loaders for six deadline-bearing entities that
-- already had reminder jobs but were never surfaced on the "what's due"
-- page. Four of them already carried a usable tenant-scoped date index
-- (AccessReview.dueAt, ControlException.expiresAt,
-- IncidentNotification (tenantId, status, dueAt)); these two did not.
--
-- Every calendar loader issues the same query shape:
--
--     WHERE tenantId = $1 AND <date> BETWEEN $2 AND $3
--     ORDER BY <date> ASC
--     LIMIT 500
--
-- so a (tenantId, <date>) composite serves both the range predicate and
-- the ordering. The ORDER BY is load-bearing, not cosmetic: the per-source
-- cap means an unordered scan would truncate to an ARBITRARY 500 rows,
-- silently hiding the soonest deadlines. With the index the planner walks
-- the range in date order and stops at the limit.
--
-- Both are pure index additions — no data movement, no lock beyond the
-- brief ShareLock CREATE INDEX takes. Rollback is DROP INDEX.

-- TrainingAssignment.dueAt — training-due events.
CREATE INDEX IF NOT EXISTS "TrainingAssignment_tenantId_dueAt_idx"
    ON "TrainingAssignment" ("tenantId", "dueAt");

-- VendorAssessment.nextReviewAt — vendor-reassessment events. Distinct
-- from Vendor.nextReviewAt (the vendor-level review, already indexed).
CREATE INDEX IF NOT EXISTS "VendorAssessment_tenantId_nextReviewAt_idx"
    ON "VendorAssessment" ("tenantId", "nextReviewAt");

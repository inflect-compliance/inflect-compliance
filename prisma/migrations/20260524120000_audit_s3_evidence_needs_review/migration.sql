-- Audit S3 — Evidence Management & Retention (2026-05-24)
--
-- Add `NEEDS_REVIEW` value to the `EvidenceStatus` enum. A daily
-- cron transitions APPROVED evidence past its `nextReviewDate`
-- here; the owner re-submits to re-enter the review queue. Pre-
-- this-PR stale evidence silently aged past its review date with no
-- status change — auditors couldn't tell which approved rows were
-- still current.

ALTER TYPE "EvidenceStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';

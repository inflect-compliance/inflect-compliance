-- PR-S — marker relation for assessment-review-sourced vendor↔risk links, so
-- the auto-risk idempotency check can distinguish its own link from unrelated
-- manual RISK links.
ALTER TYPE "VendorLinkRelation" ADD VALUE IF NOT EXISTS 'ASSESSMENT_SOURCED';

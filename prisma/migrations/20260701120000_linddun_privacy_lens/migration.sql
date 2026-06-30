-- LINDDUN privacy-threat lens (P2): an optional JSON array of LINDDUN
-- category codes tagging a Risk / RiskTemplate with the privacy threats it
-- embodies, alongside the existing `category`. A lens over the existing risk
-- machinery — not a parallel engine. See src/lib/privacy/linddun.ts.
ALTER TABLE "Risk" ADD COLUMN "linddunCategories" JSONB;
ALTER TABLE "RiskTemplate" ADD COLUMN "linddunCategories" JSONB;

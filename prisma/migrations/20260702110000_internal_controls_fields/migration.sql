-- Internal-controls import: objective / success criteria / testing methodology.
-- Nullable TEXT on both the per-tenant Control and the global ControlTemplate;
-- ControlTemplate also carries the pipe-separated related-policy names from the
-- source export. All additive + nullable — safe on existing rows.

-- Control (per-tenant): surfaced on the control detail Overview + Tests tabs.
ALTER TABLE "Control" ADD COLUMN IF NOT EXISTS "objective" TEXT;
ALTER TABLE "Control" ADD COLUMN IF NOT EXISTS "successCriteria" TEXT;
ALTER TABLE "Control" ADD COLUMN IF NOT EXISTS "testingMethodology" TEXT;

-- ControlTemplate (global library): carries the imported values + related policies;
-- copied onto the Control on pack install.
ALTER TABLE "ControlTemplate" ADD COLUMN IF NOT EXISTS "objective" TEXT;
ALTER TABLE "ControlTemplate" ADD COLUMN IF NOT EXISTS "successCriteria" TEXT;
ALTER TABLE "ControlTemplate" ADD COLUMN IF NOT EXISTS "testingMethodology" TEXT;
ALTER TABLE "ControlTemplate" ADD COLUMN IF NOT EXISTS "relatedPolicies" TEXT;

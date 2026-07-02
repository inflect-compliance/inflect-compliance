-- Control: drop the `description` and `intent` columns.
-- Deliberate, approved destructive change — the three descriptive fields
-- objective / successCriteria / testingMethodology remain the canonical
-- descriptive surface for a Control. ControlTemplate.description is a
-- separate column and is unaffected.
ALTER TABLE "Control" DROP COLUMN IF EXISTS "description";
ALTER TABLE "Control" DROP COLUMN IF EXISTS "intent";

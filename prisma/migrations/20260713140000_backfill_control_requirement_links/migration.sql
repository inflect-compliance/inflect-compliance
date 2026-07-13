-- Backfill: converge legacy FrameworkMapping control-links onto the
-- canonical ControlRequirementLink table.
--
-- The template-library install path historically wrote FrameworkMapping rows
-- (requirement -> control) that NO posture surface reads: the ISO SoA,
-- per-framework coverage and per-framework readiness all read
-- ControlRequirementLink. Controls installed via the template library
-- therefore rendered as unmapped and never counted toward any framework's
-- coverage/readiness.
--
-- This inserts a matching ControlRequirementLink for every FrameworkMapping
-- that points a requirement at a control, deriving tenantId from the control
-- (the legacy FrameworkMapping table carries no tenantId column). Only
-- control-targeted mappings are backfilled — requirement->requirement
-- mappings (toControlId IS NULL) are cross-framework links and are left
-- untouched.
--
-- Idempotent: the NOT EXISTS guard plus the [controlId, requirementId] unique
-- constraint on ControlRequirementLink make re-runs no-ops. The id is derived
-- deterministically from the source FrameworkMapping id (which is 1:1 with a
-- (control, requirement) pair via its own unique constraint) — no extension
-- required, and a re-run would produce the same id (though the guard already
-- blocks a second insert).
INSERT INTO "ControlRequirementLink" ("id", "tenantId", "controlId", "requirementId", "createdAt")
SELECT 'crl_' || fm."id", c."tenantId", fm."toControlId", fm."fromRequirementId", CURRENT_TIMESTAMP
FROM "FrameworkMapping" fm
JOIN "Control" c ON c."id" = fm."toControlId"
WHERE fm."toControlId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ControlRequirementLink" crl
    WHERE crl."controlId" = fm."toControlId"
      AND crl."requirementId" = fm."fromRequirementId"
  );

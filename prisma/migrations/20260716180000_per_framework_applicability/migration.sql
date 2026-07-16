-- Per-framework applicability override on the control↔requirement link.
-- NULL = inherit the control's global Control.applicability (no backfill: every
-- existing link inherits, preserving today's behaviour). Set to scope an N/A
-- decision to one framework.
ALTER TABLE "ControlRequirementLink" ADD COLUMN "applicability" "Applicability";
ALTER TABLE "ControlRequirementLink" ADD COLUMN "applicabilityJustification" TEXT;

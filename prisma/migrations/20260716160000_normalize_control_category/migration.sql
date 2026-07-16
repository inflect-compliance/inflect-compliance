-- Normalize the legacy free-text control categories (the retired create-modal
-- vocabulary) onto the four canonical ISO/IEC 27002:2022 themes, so all three
-- editing surfaces (create modal, quick-edit panel, detail edit modal) share
-- one vocabulary. Keyed on the EXACT strings the old UI wrote (case-sensitive)
-- so framework-seed granular domains — e.g. "Access control" (lower-c) or SOC 2
-- TSC names — are intentionally left untouched (the list/browse display derives
-- their grouping via categorizeControl, and the editors preserve any non-theme
-- value as an option). "Other" carried no meaningful theme → NULL.
-- Mirror of src/lib/controls/control-categories.ts::LEGACY_FREE_TEXT_TO_THEME.
UPDATE "Control"
SET "category" = CASE "category"
    WHEN 'Access Control'      THEN 'TECHNOLOGICAL'
    WHEN 'Encryption'          THEN 'TECHNOLOGICAL'
    WHEN 'Network Security'    THEN 'TECHNOLOGICAL'
    WHEN 'Physical Security'   THEN 'PHYSICAL'
    WHEN 'HR Security'         THEN 'PEOPLE'
    WHEN 'Operations'          THEN 'TECHNOLOGICAL'
    WHEN 'Compliance'          THEN 'ORGANIZATIONAL'
    WHEN 'Incident Management' THEN 'ORGANIZATIONAL'
    WHEN 'Business Continuity' THEN 'ORGANIZATIONAL'
    WHEN 'Other'               THEN NULL
    ELSE "category"
END
WHERE "category" IN (
    'Access Control', 'Encryption', 'Network Security', 'Physical Security',
    'HR Security', 'Operations', 'Compliance', 'Incident Management',
    'Business Continuity', 'Other'
);

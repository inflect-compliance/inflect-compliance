-- Backfill Asset.criticality for legacy rows written before derive-on-write.
--
-- Never-edited rows can carry criticality = NULL while the table badge/sort
-- derive a live value from the CIA triad — so the badge shows (say) "High"
-- but the criticality KPI card and the criticality filter (which read the
-- stored enum) skip the row. This backfill computes the stored enum for every
-- NULL row so badge, KPI, and filter agree.
--
-- The CASE replicates src/lib/asset-criticality.ts::getAssetCriticality EXACTLY:
--   • Critical override: any CIA dimension at the ceiling (5) => CRITICAL.
--   • Otherwise band from the ROUNDED mean of the two highest dimensions
--     (sum of the top two = (C + I + A) - min): 4 => HIGH, 3 => MEDIUM, else LOW.
-- Postgres round(numeric) rounds half away from zero, matching JS Math.round
-- for the positive 1..5 domain. Missing dimensions default to 3 (the column
-- default). Only NULL rows are touched; derive-on-write keeps every future
-- write consistent, so this runs once and stays true.
UPDATE "Asset" AS a
SET "criticality" = (
    CASE
        WHEN GREATEST(
                COALESCE(a."confidentiality", 3),
                COALESCE(a."integrity", 3),
                COALESCE(a."availability", 3)
             ) >= 5
            THEN 'CRITICAL'
        WHEN round(
                (
                    (COALESCE(a."confidentiality", 3) + COALESCE(a."integrity", 3) + COALESCE(a."availability", 3))
                    - LEAST(COALESCE(a."confidentiality", 3), COALESCE(a."integrity", 3), COALESCE(a."availability", 3))
                )::numeric / 2
             ) >= 4
            THEN 'HIGH'
        WHEN round(
                (
                    (COALESCE(a."confidentiality", 3) + COALESCE(a."integrity", 3) + COALESCE(a."availability", 3))
                    - LEAST(COALESCE(a."confidentiality", 3), COALESCE(a."integrity", 3), COALESCE(a."availability", 3))
                )::numeric / 2
             ) >= 3
            THEN 'MEDIUM'
        ELSE 'LOW'
    END
)::"Criticality"
WHERE a."criticality" IS NULL;

-- Unify asset criticality — step 2 of 2.
--
-- Backfill every existing Asset's stored `criticality` enum from its C/I/A
-- triad, using the SAME banding as `getAssetCriticality`
-- (src/lib/asset-criticality.ts) so the persisted level agrees with the badge
-- the UI derives:
--
--   hi   = GREATEST(c, i, a)                     -- highest dimension
--   mid  = c + i + a - GREATEST(c,i,a) - LEAST(c,i,a)  -- second-highest
--   IF hi >= 5                       -> CRITICAL  (critical-ceiling override)
--   ELSE score = ROUND((hi + mid)/2)
--        score >= 4                  -> HIGH
--        score >= 3                  -> MEDIUM
--        ELSE                        -> LOW
--
-- Null C/I/A default to 3 (the column default), matching how the app treats a
-- missing dimension. ROUND on the numeric expression rounds halves away from
-- zero for positive values, matching JS Math.round (half-up). Runs in its own
-- transaction, after 'CRITICAL' was committed by the prior migration.
UPDATE "Asset" AS t
SET "criticality" = sub.crit::"Criticality"
FROM (
    SELECT
        id,
        CASE
            WHEN hi >= 5 THEN 'CRITICAL'
            WHEN ROUND((hi + mid) / 2.0) >= 4 THEN 'HIGH'
            WHEN ROUND((hi + mid) / 2.0) >= 3 THEN 'MEDIUM'
            ELSE 'LOW'
        END AS crit
    FROM (
        SELECT
            id,
            GREATEST(c, i, a) AS hi,
            (c + i + a - GREATEST(c, i, a) - LEAST(c, i, a)) AS mid
        FROM (
            SELECT
                id,
                COALESCE("confidentiality", 3) AS c,
                COALESCE("integrity", 3) AS i,
                COALESCE("availability", 3) AS a
            FROM "Asset"
        ) base
    ) computed
) sub
WHERE t.id = sub.id;

-- AI sovereignty — per-tenant AI-residency posture (DS-1).
-- Adds the AiResidency enum + a NOT NULL column (default EXTERNAL) and two
-- optional local-gateway override columns on TenantSecuritySettings.
-- Additive + defaulted — safe on existing rows. No RLS change:
-- TenantSecuritySettings already carries tenant_isolation + superuser_bypass
-- row policies; new columns are covered by the row policies.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AiResidency') THEN
        CREATE TYPE "AiResidency" AS ENUM ('EXTERNAL', 'LOCAL_ONLY');
    END IF;
END
$$;

ALTER TABLE "TenantSecuritySettings"
    ADD COLUMN IF NOT EXISTS "aiResidency" "AiResidency" NOT NULL DEFAULT 'EXTERNAL',
    ADD COLUMN IF NOT EXISTS "aiLocalBaseUrl" TEXT,
    ADD COLUMN IF NOT EXISTS "aiLocalModel" TEXT;

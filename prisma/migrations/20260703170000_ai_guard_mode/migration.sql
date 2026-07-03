-- AI Guard per-tenant enforcement posture.
-- Adds the AiGuardMode enum + a NOT NULL column (default BALANCED) on
-- TenantSecuritySettings. Additive + defaulted — safe on existing rows.
-- No RLS change: TenantSecuritySettings already carries tenant_isolation +
-- superuser_bypass row policies; a new column is covered by the row policies.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AiGuardMode') THEN
        CREATE TYPE "AiGuardMode" AS ENUM ('STRICT', 'BALANCED', 'AUDIT');
    END IF;
END
$$;

ALTER TABLE "TenantSecuritySettings"
    ADD COLUMN IF NOT EXISTS "aiGuardMode" "AiGuardMode" NOT NULL DEFAULT 'BALANCED';

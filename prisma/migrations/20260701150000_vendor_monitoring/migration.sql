-- Continuous vendor monitoring + breach intelligence.
--
-- Moves vendor assurance from "assessed once" (a point-in-time questionnaire
-- that goes stale the moment it's signed) to "continuously assured". Two
-- tenant-scoped tables:
--   • VendorMonitor      — 1:1 per vendor: which checks are on + rolling
--                          state (last run, breach date, TLS grade,
--                          attestation expiry).
--   • VendorPostureEvent — append-only posture timeline; `fingerprint` makes
--                          recurring signals idempotent, `createdFindingId`
--                          links the materialised Finding.
-- Plus a dedicated notification type for posture alerts. Canonical
-- non-nullable-tenant RLS triple on both tables.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VENDOR_POSTURE_ALERT';

-- ─── 1. VendorMonitor ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VendorMonitor" (
    "id"                   TEXT NOT NULL,
    "tenantId"             TEXT NOT NULL,
    "vendorId"             TEXT NOT NULL,
    "enabled"              BOOLEAN NOT NULL DEFAULT true,
    "checkAttestation"     BOOLEAN NOT NULL DEFAULT true,
    "checkBreach"          BOOLEAN NOT NULL DEFAULT true,
    "checkTls"             BOOLEAN NOT NULL DEFAULT true,
    "materializeFindings"  BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt"            TIMESTAMP(3),
    "lastRunStatus"        TEXT,
    "lastError"            TEXT,
    "breachLastSeenAt"     TIMESTAMP(3),
    "breachCount"          INTEGER NOT NULL DEFAULT 0,
    "tlsGrade"             TEXT,
    "tlsCheckedAt"         TIMESTAMP(3),
    "attestationExpiresAt" TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorMonitor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VendorMonitor_tenantId_vendorId_key" ON "VendorMonitor" ("tenantId", "vendorId");
CREATE INDEX IF NOT EXISTS "VendorMonitor_tenantId_enabled_idx"         ON "VendorMonitor" ("tenantId", "enabled");
CREATE INDEX IF NOT EXISTS "VendorMonitor_tenantId_lastRunAt_idx"       ON "VendorMonitor" ("tenantId", "lastRunAt");

-- ─── 2. VendorPostureEvent ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VendorPostureEvent" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "vendorId"         TEXT NOT NULL,
    "eventType"        TEXT NOT NULL,
    "severity"         TEXT NOT NULL DEFAULT 'INFO',
    "source"           TEXT NOT NULL DEFAULT 'internal',
    "summary"          TEXT NOT NULL,
    "fingerprint"      TEXT NOT NULL,
    "detailsJson"      JSONB,
    "createdFindingId" TEXT,
    "occurredAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorPostureEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VendorPostureEvent_tenantId_fingerprint_key"    ON "VendorPostureEvent" ("tenantId", "fingerprint");
CREATE INDEX IF NOT EXISTS "VendorPostureEvent_tenantId_vendorId_occurredAt_idx"   ON "VendorPostureEvent" ("tenantId", "vendorId", "occurredAt");
CREATE INDEX IF NOT EXISTS "VendorPostureEvent_tenantId_eventType_idx"             ON "VendorPostureEvent" ("tenantId", "eventType");

-- ─── 3. Foreign keys ────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE "VendorMonitor" ADD CONSTRAINT "VendorMonitor_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "VendorMonitor" ADD CONSTRAINT "VendorMonitor_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "VendorPostureEvent" ADD CONSTRAINT "VendorPostureEvent_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "VendorPostureEvent" ADD CONSTRAINT "VendorPostureEvent_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. RLS (standard non-nullable-tenant triple) ───────────────────
ALTER TABLE "VendorMonitor"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorMonitor"      FORCE ROW LEVEL SECURITY;
ALTER TABLE "VendorPostureEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorPostureEvent" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "VendorMonitor";
CREATE POLICY tenant_isolation ON "VendorMonitor"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "VendorMonitor";
CREATE POLICY tenant_isolation_insert ON "VendorMonitor"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "VendorMonitor";
CREATE POLICY superuser_bypass ON "VendorMonitor"
    USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS tenant_isolation ON "VendorPostureEvent";
CREATE POLICY tenant_isolation ON "VendorPostureEvent"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "VendorPostureEvent";
CREATE POLICY tenant_isolation_insert ON "VendorPostureEvent"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "VendorPostureEvent";
CREATE POLICY superuser_bypass ON "VendorPostureEvent"
    USING (current_setting('role') != 'app_user');

-- PR-8 — gated trust-center documents + access requests. Tenant-scoped, RLS.

-- ─── 1. Enum ───
DO $$ BEGIN
    CREATE TYPE "TrustCenterAccessStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DENIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. TrustCenter new columns ───
ALTER TABLE "TrustCenter" ADD COLUMN IF NOT EXISTS "accessDomainAllowlist" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "TrustCenter" ADD COLUMN IF NOT EXISTS "ndaRequired" BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. TrustCenterDocument ───
CREATE TABLE IF NOT EXISTS "TrustCenterDocument" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "trustCenterId" TEXT NOT NULL,
    "label"         TEXT NOT NULL,
    "fileRecordId"  TEXT NOT NULL,
    "gated"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrustCenterDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TrustCenterDocument_tenantId_idx"               ON "TrustCenterDocument" ("tenantId");
CREATE INDEX IF NOT EXISTS "TrustCenterDocument_tenantId_trustCenterId_idx" ON "TrustCenterDocument" ("tenantId", "trustCenterId");
DO $$ BEGIN
    ALTER TABLE "TrustCenterDocument" ADD CONSTRAINT "TrustCenterDocument_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "TrustCenterDocument" ADD CONSTRAINT "TrustCenterDocument_trustCenterId_fkey"
        FOREIGN KEY ("trustCenterId") REFERENCES "TrustCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. TrustCenterAccessRequest ───
CREATE TABLE IF NOT EXISTS "TrustCenterAccessRequest" (
    "id"                TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "documentId"        TEXT NOT NULL,
    "requesterName"     TEXT NOT NULL,
    "requesterEmail"    TEXT NOT NULL,
    "company"           TEXT,
    "status"            "TrustCenterAccessStatus" NOT NULL DEFAULT 'REQUESTED',
    "ndaSignedAt"       TIMESTAMP(3),
    "grantedAt"         TIMESTAMP(3),
    "expiresAt"         TIMESTAMP(3),
    "downloadTokenHash" TEXT,
    "downloadedAt"      TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrustCenterAccessRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrustCenterAccessRequest_downloadTokenHash_key" ON "TrustCenterAccessRequest" ("downloadTokenHash");
CREATE INDEX IF NOT EXISTS "TrustCenterAccessRequest_tenantId_idx"            ON "TrustCenterAccessRequest" ("tenantId");
CREATE INDEX IF NOT EXISTS "TrustCenterAccessRequest_tenantId_status_idx"     ON "TrustCenterAccessRequest" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "TrustCenterAccessRequest_tenantId_documentId_idx" ON "TrustCenterAccessRequest" ("tenantId", "documentId");
DO $$ BEGIN
    ALTER TABLE "TrustCenterAccessRequest" ADD CONSTRAINT "TrustCenterAccessRequest_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "TrustCenterAccessRequest" ADD CONSTRAINT "TrustCenterAccessRequest_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "TrustCenterDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. RLS (standard triple, both new tables) ───
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['TrustCenterDocument','TrustCenterAccessRequest'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)::text)', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I', t);
        EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true)::text)', t);
        EXECUTE format('DROP POLICY IF EXISTS superuser_bypass ON %I', t);
        EXECUTE format('CREATE POLICY superuser_bypass ON %I USING (current_setting(''role'') != ''app_user'')', t);
    END LOOP;
END $$;

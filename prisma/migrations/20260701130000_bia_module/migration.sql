-- Business Impact Analysis (ISO 22301 / NIS2 Art.21(2)(c) / DORA) — the
-- operational-continuity artifact, sibling to Incidents. Two tenant-scoped
-- tables with the canonical non-nullable-tenant RLS triple, plus the
-- BIA-as-evidence wiring on ControlEvidenceLink (new `biaId` + `BIA` kind).

-- ─── 1. New EvidenceLinkKind value ──────────────────────────────────
-- (Not used within this migration, so it is txn-safe on PG 12+.)
ALTER TYPE "EvidenceLinkKind" ADD VALUE IF NOT EXISTS 'BIA';

-- ─── 2. BusinessImpactAnalysis ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BusinessImpactAnalysis" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "processNodeId" TEXT,
    "name"          TEXT NOT NULL,
    "criticality"   TEXT NOT NULL,
    "rtoHours"      INTEGER,
    "rpoHours"      INTEGER,
    "mtpdHours"     INTEGER,
    "impactProfile" JSONB,
    "notes"         TEXT,
    "ownerUserId"   TEXT,
    "reviewedAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessImpactAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BusinessImpactAnalysis_tenantId_criticality_idx"   ON "BusinessImpactAnalysis" ("tenantId", "criticality");
CREATE INDEX IF NOT EXISTS "BusinessImpactAnalysis_tenantId_processNodeId_idx" ON "BusinessImpactAnalysis" ("tenantId", "processNodeId");
CREATE INDEX IF NOT EXISTS "BusinessImpactAnalysis_tenantId_ownerUserId_idx"   ON "BusinessImpactAnalysis" ("tenantId", "ownerUserId");

-- ─── 3. BiaDependency ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BiaDependency" (
    "id"            TEXT NOT NULL,
    "biaId"         TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "dependsOnType" TEXT NOT NULL,
    "dependsOnId"   TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BiaDependency_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BiaDependency_tenantId_biaId_idx" ON "BiaDependency" ("tenantId", "biaId");

-- ─── 4. ControlEvidenceLink.biaId ───────────────────────────────────
ALTER TABLE "ControlEvidenceLink" ADD COLUMN IF NOT EXISTS "biaId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ControlEvidenceLink_controlId_kind_biaId_key" ON "ControlEvidenceLink" ("controlId", "kind", "biaId");
CREATE INDEX IF NOT EXISTS "ControlEvidenceLink_tenantId_biaId_idx" ON "ControlEvidenceLink" ("tenantId", "biaId");

-- ─── 5. Foreign keys ────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE "BusinessImpactAnalysis"
        ADD CONSTRAINT "BusinessImpactAnalysis_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "BusinessImpactAnalysis"
        ADD CONSTRAINT "BusinessImpactAnalysis_processNodeId_fkey"
        FOREIGN KEY ("processNodeId") REFERENCES "ProcessNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "BusinessImpactAnalysis"
        ADD CONSTRAINT "BusinessImpactAnalysis_ownerUserId_fkey"
        FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "BiaDependency"
        ADD CONSTRAINT "BiaDependency_biaId_fkey"
        FOREIGN KEY ("biaId") REFERENCES "BusinessImpactAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "BiaDependency"
        ADD CONSTRAINT "BiaDependency_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ControlEvidenceLink"
        ADD CONSTRAINT "ControlEvidenceLink_biaId_fkey"
        FOREIGN KEY ("biaId") REFERENCES "BusinessImpactAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 6. RLS (standard non-nullable-tenant triple) ───────────────────
ALTER TABLE "BusinessImpactAnalysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessImpactAnalysis" FORCE ROW LEVEL SECURITY;
ALTER TABLE "BiaDependency"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BiaDependency"          FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "BusinessImpactAnalysis";
CREATE POLICY tenant_isolation ON "BusinessImpactAnalysis"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "BusinessImpactAnalysis";
CREATE POLICY tenant_isolation_insert ON "BusinessImpactAnalysis"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "BusinessImpactAnalysis";
CREATE POLICY superuser_bypass ON "BusinessImpactAnalysis"
    USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS tenant_isolation ON "BiaDependency";
CREATE POLICY tenant_isolation ON "BiaDependency"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "BiaDependency";
CREATE POLICY tenant_isolation_insert ON "BiaDependency"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "BiaDependency";
CREATE POLICY superuser_bypass ON "BiaDependency"
    USING (current_setting('role') != 'app_user');

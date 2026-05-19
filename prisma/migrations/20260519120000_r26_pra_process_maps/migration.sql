-- ═══════════════════════════════════════════════════════════════════
-- Roadmap-26 PR-A — Process Maps persistence.
--
-- Four new tenant-scoped tables backing the Processes-page xyflow
-- canvas:
--   ProcessMap         — metadata (name, description, status, version)
--   ProcessNode        — one row per canvas node
--   ProcessEdge        — one row per canvas edge
--   ProcessEdgeControl — controls placed on top of an edge
--
-- One new enum (ProcessMapStatus). See prisma/schema/enums.prisma.
--
-- Class-A direct-scoped RLS — canonical three-policy setup
--   tenant_isolation        (USING)
--   tenant_isolation_insert (FOR INSERT WITH CHECK)
--   superuser_bypass        (USING role != 'app_user')
-- plus FORCE ROW LEVEL SECURITY. Mirrors the Epic G-7
-- RiskTreatmentPlan migration shape.
--
-- Composite parent FKs — every child carries `(parentId, tenantId)`
-- as the FK target. Cross-tenant child writes are structurally
-- impossible because the FK target unique key is `(id, tenantId)`
-- on the parent.
-- ═══════════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────

CREATE TYPE "ProcessMapStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- ── Tables ─────────────────────────────────────────────────────────

CREATE TABLE "ProcessMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProcessMapStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    CONSTRAINT "ProcessMap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessNode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processMapId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "subtitle" TEXT,
    "posX" DOUBLE PRECISION NOT NULL,
    "posY" DOUBLE PRECISION NOT NULL,
    "dataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessNode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessEdge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processMapId" TEXT NOT NULL,
    "edgeKey" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "edgeKind" TEXT NOT NULL DEFAULT 'flow',
    "labelOverride" TEXT,
    "dataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessEdge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessEdgeControl" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processMapId" TEXT NOT NULL,
    "edgeId" TEXT NOT NULL,
    "controlKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "controlId" TEXT,
    "dataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessEdgeControl_pkey" PRIMARY KEY ("id")
);

-- ── Composite parent keys ──────────────────────────────────────────

CREATE UNIQUE INDEX "ProcessMap_id_tenantId_key" ON "ProcessMap"("id", "tenantId");
CREATE UNIQUE INDEX "ProcessEdge_id_tenantId_key" ON "ProcessEdge"("id", "tenantId");

-- ── Per-map key uniqueness ─────────────────────────────────────────

CREATE UNIQUE INDEX "ProcessNode_processMapId_nodeKey_key"
    ON "ProcessNode"("processMapId", "nodeKey");

CREATE UNIQUE INDEX "ProcessEdge_processMapId_edgeKey_key"
    ON "ProcessEdge"("processMapId", "edgeKey");

CREATE UNIQUE INDEX "ProcessEdgeControl_edgeId_controlKey_key"
    ON "ProcessEdgeControl"("edgeId", "controlKey");

-- ── Indexes ────────────────────────────────────────────────────────

CREATE INDEX "ProcessMap_tenantId_deletedAt_idx"
    ON "ProcessMap"("tenantId", "deletedAt");
CREATE INDEX "ProcessMap_tenantId_updatedAt_idx"
    ON "ProcessMap"("tenantId", "updatedAt");

CREATE INDEX "ProcessNode_tenantId_processMapId_idx"
    ON "ProcessNode"("tenantId", "processMapId");

CREATE INDEX "ProcessEdge_tenantId_processMapId_idx"
    ON "ProcessEdge"("tenantId", "processMapId");

CREATE INDEX "ProcessEdgeControl_tenantId_processMapId_idx"
    ON "ProcessEdgeControl"("tenantId", "processMapId");
CREATE INDEX "ProcessEdgeControl_tenantId_controlId_idx"
    ON "ProcessEdgeControl"("tenantId", "controlId");

-- ── Foreign keys ───────────────────────────────────────────────────

ALTER TABLE "ProcessMap"
    ADD CONSTRAINT "ProcessMap_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProcessMap"
    ADD CONSTRAINT "ProcessMap_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProcessMap"
    ADD CONSTRAINT "ProcessMap_deletedByUserId_fkey"
    FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProcessNode"
    ADD CONSTRAINT "ProcessNode_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite FK + CASCADE so deleting a map drops its nodes.
ALTER TABLE "ProcessNode"
    ADD CONSTRAINT "ProcessNode_processMapId_tenantId_fkey"
    FOREIGN KEY ("processMapId", "tenantId") REFERENCES "ProcessMap"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProcessEdge"
    ADD CONSTRAINT "ProcessEdge_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProcessEdge"
    ADD CONSTRAINT "ProcessEdge_processMapId_tenantId_fkey"
    FOREIGN KEY ("processMapId", "tenantId") REFERENCES "ProcessMap"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProcessEdgeControl"
    ADD CONSTRAINT "ProcessEdgeControl_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProcessEdgeControl"
    ADD CONSTRAINT "ProcessEdgeControl_edgeId_tenantId_fkey"
    FOREIGN KEY ("edgeId", "tenantId") REFERENCES "ProcessEdge"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row Level Security ─────────────────────────────────────────────

ALTER TABLE "ProcessMap" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessMap" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProcessMap";
CREATE POLICY tenant_isolation ON "ProcessMap"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ProcessMap";
CREATE POLICY tenant_isolation_insert ON "ProcessMap"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ProcessMap";
CREATE POLICY superuser_bypass ON "ProcessMap"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "ProcessNode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessNode" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProcessNode";
CREATE POLICY tenant_isolation ON "ProcessNode"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ProcessNode";
CREATE POLICY tenant_isolation_insert ON "ProcessNode"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ProcessNode";
CREATE POLICY superuser_bypass ON "ProcessNode"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "ProcessEdge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessEdge" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProcessEdge";
CREATE POLICY tenant_isolation ON "ProcessEdge"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ProcessEdge";
CREATE POLICY tenant_isolation_insert ON "ProcessEdge"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ProcessEdge";
CREATE POLICY superuser_bypass ON "ProcessEdge"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "ProcessEdgeControl" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessEdgeControl" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProcessEdgeControl";
CREATE POLICY tenant_isolation ON "ProcessEdgeControl"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "ProcessEdgeControl";
CREATE POLICY tenant_isolation_insert ON "ProcessEdgeControl"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "ProcessEdgeControl";
CREATE POLICY superuser_bypass ON "ProcessEdgeControl"
    USING (current_setting('role') != 'app_user');

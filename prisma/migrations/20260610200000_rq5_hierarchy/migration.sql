-- RQ-5 — risk hierarchy nodes + risk↔node links.
CREATE TABLE "RiskHierarchyNode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    CONSTRAINT "RiskHierarchyNode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RiskHierarchyNode_tenantId_type_name_key" ON "RiskHierarchyNode"("tenantId", "type", "name");
CREATE INDEX "RiskHierarchyNode_tenantId_type_idx" ON "RiskHierarchyNode"("tenantId", "type");
CREATE INDEX "RiskHierarchyNode_tenantId_parentId_idx" ON "RiskHierarchyNode"("tenantId", "parentId");
CREATE INDEX "RiskHierarchyNode_parentId_idx" ON "RiskHierarchyNode"("parentId");
ALTER TABLE "RiskHierarchyNode" ADD CONSTRAINT "RiskHierarchyNode_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "RiskHierarchyNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RiskHierarchyNode" ADD CONSTRAINT "RiskHierarchyNode_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RiskHierarchyLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskHierarchyLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RiskHierarchyLink_tenantId_riskId_nodeId_key" ON "RiskHierarchyLink"("tenantId", "riskId", "nodeId");
CREATE INDEX "RiskHierarchyLink_tenantId_nodeId_idx" ON "RiskHierarchyLink"("tenantId", "nodeId");
CREATE INDEX "RiskHierarchyLink_tenantId_riskId_idx" ON "RiskHierarchyLink"("tenantId", "riskId");
CREATE INDEX "RiskHierarchyLink_nodeId_idx" ON "RiskHierarchyLink"("nodeId");
ALTER TABLE "RiskHierarchyLink" ADD CONSTRAINT "RiskHierarchyLink_riskId_fkey"
    FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskHierarchyLink" ADD CONSTRAINT "RiskHierarchyLink_nodeId_fkey"
    FOREIGN KEY ("nodeId") REFERENCES "RiskHierarchyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskHierarchyLink" ADD CONSTRAINT "RiskHierarchyLink_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── RLS (tenant isolation) ──
ALTER TABLE "RiskHierarchyNode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskHierarchyNode" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RiskHierarchyNode";
CREATE POLICY tenant_isolation ON "RiskHierarchyNode" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskHierarchyNode";
CREATE POLICY tenant_isolation_insert ON "RiskHierarchyNode" FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "RiskHierarchyNode";
CREATE POLICY superuser_bypass ON "RiskHierarchyNode" USING (current_setting('role') != 'app_user');

ALTER TABLE "RiskHierarchyLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskHierarchyLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RiskHierarchyLink";
CREATE POLICY tenant_isolation ON "RiskHierarchyLink" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskHierarchyLink";
CREATE POLICY tenant_isolation_insert ON "RiskHierarchyLink" FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "RiskHierarchyLink";
CREATE POLICY superuser_bypass ON "RiskHierarchyLink" USING (current_setting('role') != 'app_user');

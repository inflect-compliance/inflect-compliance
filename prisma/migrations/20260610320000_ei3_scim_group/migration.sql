-- EI-3 — SCIM 2.0 Group registry.
CREATE TABLE "ScimGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "membersJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScimGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScimGroup_tenantId_externalId_key" ON "ScimGroup"("tenantId", "externalId");
CREATE INDEX "ScimGroup_tenantId_idx" ON "ScimGroup"("tenantId");
ALTER TABLE "ScimGroup" ADD CONSTRAINT "ScimGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS — tenant isolation + superuser bypass (matches the codebase pattern).
ALTER TABLE "ScimGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScimGroup" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScimGroup"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "ScimGroup"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY superuser_bypass ON "ScimGroup"
    USING (current_setting('role') != 'app_user');

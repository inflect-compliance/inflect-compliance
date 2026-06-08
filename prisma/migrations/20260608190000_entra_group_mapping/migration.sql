-- EI-2 — Entra group → IC role mapping.

ALTER TABLE "TenantMembership" ADD COLUMN "provisionedByEntraGroup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantMembership" ADD COLUMN "lastEntraGroupMappingId" TEXT;

CREATE TABLE "EntraGroupMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "aadGroupId" TEXT NOT NULL,
    "aadGroupName" TEXT,
    "icRole" "Role" NOT NULL DEFAULT 'READER',
    "customRoleId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EntraGroupMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EntraGroupMapping_tenantId_aadGroupId_key" ON "EntraGroupMapping"("tenantId", "aadGroupId");
CREATE INDEX "EntraGroupMapping_tenantId_providerId_idx" ON "EntraGroupMapping"("tenantId", "providerId");
CREATE INDEX "EntraGroupMapping_tenantId_isActive_idx" ON "EntraGroupMapping"("tenantId", "isActive");
CREATE INDEX "EntraGroupMapping_customRoleId_idx" ON "EntraGroupMapping"("customRoleId");

ALTER TABLE "EntraGroupMapping" ADD CONSTRAINT "EntraGroupMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntraGroupMapping" ADD CONSTRAINT "EntraGroupMapping_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "TenantIdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntraGroupMapping" ADD CONSTRAINT "EntraGroupMapping_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "TenantCustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (Epic A.1 — every tenant-scoped table)
ALTER TABLE "EntraGroupMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EntraGroupMapping" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EntraGroupMapping"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "EntraGroupMapping"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY superuser_bypass ON "EntraGroupMapping"
    USING (current_setting('role') != 'app_user');

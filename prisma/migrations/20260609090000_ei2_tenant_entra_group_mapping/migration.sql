-- EI-2 — Entra ID security-group → IC-role mapping.

-- CreateTable
CREATE TABLE "TenantEntraGroupMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aadGroupId" TEXT NOT NULL,
    "aadGroupName" TEXT,
    "role" "Role" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantEntraGroupMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantEntraGroupMapping_tenantId_idx" ON "TenantEntraGroupMapping"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantEntraGroupMapping_tenantId_aadGroupId_key" ON "TenantEntraGroupMapping"("tenantId", "aadGroupId");

-- AddForeignKey
ALTER TABLE "TenantEntraGroupMapping" ADD CONSTRAINT "TenantEntraGroupMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Row Level Security ─────────────────────────────────────────────

ALTER TABLE "TenantEntraGroupMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantEntraGroupMapping" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantEntraGroupMapping";
CREATE POLICY tenant_isolation ON "TenantEntraGroupMapping"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantEntraGroupMapping";
CREATE POLICY tenant_isolation_insert ON "TenantEntraGroupMapping"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TenantEntraGroupMapping";
CREATE POLICY superuser_bypass ON "TenantEntraGroupMapping"
    USING (current_setting('role') != 'app_user');

-- Finding <-> Asset junction: parity with AssetRiskLink so converting a
-- vulnerability into a Finding keeps the asset↔finding graph connected.

-- CreateTable
CREATE TABLE "FindingAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "rationale" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FindingAsset_tenantId_idx" ON "FindingAsset"("tenantId");
CREATE INDEX "FindingAsset_tenantId_findingId_idx" ON "FindingAsset"("tenantId", "findingId");
CREATE INDEX "FindingAsset_tenantId_assetId_idx" ON "FindingAsset"("tenantId", "assetId");
CREATE UNIQUE INDEX "FindingAsset_tenantId_assetId_findingId_key" ON "FindingAsset"("tenantId", "assetId", "findingId");

-- AddForeignKey: composite FK to Finding(id, tenantId) (CASCADE); asset (CASCADE); createdBy (SET NULL); tenant (RESTRICT)
ALTER TABLE "FindingAsset" ADD CONSTRAINT "FindingAsset_findingId_tenantId_fkey" FOREIGN KEY ("findingId", "tenantId") REFERENCES "Finding"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingAsset" ADD CONSTRAINT "FindingAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingAsset" ADD CONSTRAINT "FindingAsset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FindingAsset" ADD CONSTRAINT "FindingAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security for the new tenant junction (canonical trio).
-- New tables inherit app_user grants via ALTER DEFAULT PRIVILEGES.
-- tenantId is NOT nullable → standard symmetric single tenant_isolation policy.
ALTER TABLE "FindingAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FindingAsset" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FindingAsset"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "FindingAsset"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY superuser_bypass ON "FindingAsset"
    USING (current_setting('role') != 'app_user');

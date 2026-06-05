-- Finding "create modal" relations: assignee (User), linked control,
-- compensating control, free-text analysis, and a many-to-many to Risk.

-- AlterTable: new Finding columns
ALTER TABLE "Finding" ADD COLUMN     "analysis" TEXT,
ADD COLUMN     "assigneeUserId" TEXT,
ADD COLUMN     "compensatingControlId" TEXT,
ADD COLUMN     "controlId" TEXT;

-- CreateTable: Finding <-> Risk junction
CREATE TABLE "FindingRisk" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingRisk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FindingRisk_tenantId_idx" ON "FindingRisk"("tenantId");
CREATE INDEX "FindingRisk_tenantId_findingId_idx" ON "FindingRisk"("tenantId", "findingId");
CREATE INDEX "FindingRisk_tenantId_riskId_idx" ON "FindingRisk"("tenantId", "riskId");
CREATE UNIQUE INDEX "FindingRisk_findingId_riskId_key" ON "FindingRisk"("findingId", "riskId");

CREATE INDEX "Finding_tenantId_assigneeUserId_idx" ON "Finding"("tenantId", "assigneeUserId");
CREATE INDEX "Finding_tenantId_controlId_idx" ON "Finding"("tenantId", "controlId");
CREATE INDEX "Finding_tenantId_compensatingControlId_idx" ON "Finding"("tenantId", "compensatingControlId");

-- AddForeignKey: Finding -> User / Control (SET NULL on delete)
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_compensatingControlId_fkey" FOREIGN KEY ("compensatingControlId") REFERENCES "Control"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: FindingRisk composite FKs to (id, tenantId) parents (CASCADE)
ALTER TABLE "FindingRisk" ADD CONSTRAINT "FindingRisk_findingId_tenantId_fkey" FOREIGN KEY ("findingId", "tenantId") REFERENCES "Finding"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingRisk" ADD CONSTRAINT "FindingRisk_riskId_tenantId_fkey" FOREIGN KEY ("riskId", "tenantId") REFERENCES "Risk"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingRisk" ADD CONSTRAINT "FindingRisk_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security for the new tenant junction (canonical trio).
-- New tables inherit app_user grants via ALTER DEFAULT PRIVILEGES.
ALTER TABLE "FindingRisk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FindingRisk" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FindingRisk"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "FindingRisk"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY superuser_bypass ON "FindingRisk"
    USING (current_setting('role') != 'app_user');

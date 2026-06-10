-- RQ-10 — BIA fields on Risk + report templates / runs / schedules.
ALTER TABLE "Risk" ADD COLUMN "rtoHours" INTEGER;
ALTER TABLE "Risk" ADD COLUMN "rpoHours" INTEGER;
ALTER TABLE "Risk" ADD COLUMN "mtpdHours" INTEGER;
ALTER TABLE "Risk" ADD COLUMN "biaImpactJson" JSONB;
ALTER TABLE "Risk" ADD COLUMN "affectedProcesses" TEXT;
ALTER TABLE "Risk" ADD COLUMN "revenueAtRisk" DOUBLE PRECISION;

CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReportTemplate_tenantId_idx" ON "ReportTemplate"("tenantId");
CREATE INDEX "ReportTemplate_tenantId_type_idx" ON "ReportTemplate"("tenantId", "type");
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "parametersJson" JSONB NOT NULL,
    "format" TEXT NOT NULL,
    "outputPath" TEXT,
    "outputSizeBytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "requestedBy" TEXT,
    "deliverToJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReportRun_tenantId_createdAt_idx" ON "ReportRun"("tenantId", "createdAt");
CREATE INDEX "ReportRun_tenantId_status_idx" ON "ReportRun"("tenantId", "status");
CREATE INDEX "ReportRun_templateId_idx" ON "ReportRun"("templateId");
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "parametersJson" JSONB NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'PDF',
    "cadence" TEXT NOT NULL,
    "deliveryDay" INTEGER,
    "recipientsJson" JSONB NOT NULL,
    "sharePointFolderId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReportSchedule_tenantId_idx" ON "ReportSchedule"("tenantId");
CREATE INDEX "ReportSchedule_nextRunAt_isActive_idx" ON "ReportSchedule"("nextRunAt", "isActive");
CREATE INDEX "ReportSchedule_templateId_idx" ON "ReportSchedule"("templateId");
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── RLS (tenant isolation) ──
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['ReportTemplate','ReportRun','ReportSchedule'] LOOP
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

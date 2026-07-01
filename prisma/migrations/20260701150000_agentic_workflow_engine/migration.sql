-- Epic Agentic 1A — the workflow engine run + step models.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "WorkflowRunStatus" AS ENUM ('RUNNING', 'AWAITING_APPROVAL', 'PAUSED', 'COMPLETED', 'ABORTED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    CREATE TYPE "WorkflowStepKind" AS ENUM ('READ', 'PROPOSE', 'HUMAN_CHECKPOINT', 'SYNTHESIS');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    CREATE TYPE "WorkflowStepStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable WorkflowRun
CREATE TABLE IF NOT EXISTS "WorkflowRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedByUserId" TEXT,
    "triggeredViaKeyId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "contextJson" TEXT,
    "summary" TEXT,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "costTokens" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkflowRun_tenantId_status_startedAt_idx" ON "WorkflowRun" ("tenantId", "status", "startedAt");

-- CreateTable WorkflowStep
CREATE TABLE IF NOT EXISTS "WorkflowStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "WorkflowStepKind" NOT NULL,
    "toolCalled" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "status" "WorkflowStepStatus" NOT NULL DEFAULT 'PENDING',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkflowStep_runId_seq_idx" ON "WorkflowStep" ("runId", "seq");
CREATE INDEX IF NOT EXISTS "WorkflowStep_tenantId_runId_idx" ON "WorkflowStep" ("tenantId", "runId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_runId_fkey"
        FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Row-Level Security (canonical tenant-isolation shape).
ALTER TABLE "WorkflowRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowRun" FORCE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowStep" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "WorkflowRun";
CREATE POLICY tenant_isolation ON "WorkflowRun"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "WorkflowRun";
CREATE POLICY tenant_isolation_insert ON "WorkflowRun"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "WorkflowRun";
CREATE POLICY superuser_bypass ON "WorkflowRun"
    USING (current_setting('role') != 'app_user');

DROP POLICY IF EXISTS tenant_isolation ON "WorkflowStep";
CREATE POLICY tenant_isolation ON "WorkflowStep"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "WorkflowStep";
CREATE POLICY tenant_isolation_insert ON "WorkflowStep"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "WorkflowStep";
CREATE POLICY superuser_bypass ON "WorkflowStep"
    USING (current_setting('role') != 'app_user');

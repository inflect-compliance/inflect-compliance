-- Epic MCP Phase 3 — the propose-not-commit queue (AgentProposal).

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AgentProposalKind" AS ENUM ('RISK', 'CONTROL', 'POLICY', 'FINDING');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgentProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "AgentProposalKind" NOT NULL,
    "status" "SuggestionItemStatus" NOT NULL DEFAULT 'PENDING',
    "payloadJson" TEXT NOT NULL,
    "rationale" TEXT,
    "proposedViaKeyId" TEXT,
    "proposedBySessionRef" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentProposal_tenantId_status_createdAt_idx" ON "AgentProposal" ("tenantId", "status", "createdAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Row-Level Security (mirrors the canonical tenant-isolation shape).
ALTER TABLE "AgentProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentProposal" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "AgentProposal";
CREATE POLICY tenant_isolation ON "AgentProposal"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AgentProposal";
CREATE POLICY tenant_isolation_insert ON "AgentProposal"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AgentProposal";
CREATE POLICY superuser_bypass ON "AgentProposal"
    USING (current_setting('role') != 'app_user');

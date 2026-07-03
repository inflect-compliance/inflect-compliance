-- Agent-action receipts — externally-verifiable evidence of AI/MCP agent actions.
--
-- Ingested from an external pipelock mediator (github.com/luckyPipewrench/pipelock
-- Apache-2.0 CORE receipt format — NOT the ELv2 "fleet" feature). Each row carries
-- a mediator-signed Ed25519 receipt over the agent's tool decision; the signature
-- is verified in-app before the row is trusted. Only a verified receipt links to a
-- hash-chained AuditLog entry (`auditLogId`). `scannedSummary` is bounded + scrubbed
-- on write (no raw payloads/secrets). Canonical non-nullable-tenant RLS triple
-- (mirrors 20260703000000_compliance_posture_summary).

-- ─── 1. Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AgentActionReceipt" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "mcpKeyId"        TEXT,
    "agentId"         TEXT,
    "toolName"        TEXT NOT NULL,
    "decisionVerdict" TEXT NOT NULL,
    "activePolicy"    TEXT,
    "scannedSummary"  JSONB NOT NULL DEFAULT '{}',
    "signature"       TEXT NOT NULL,
    "signingKeyId"    TEXT NOT NULL,
    "occurredAt"      TIMESTAMP(3) NOT NULL,
    "auditLogId"      TEXT,
    "verified"        BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentActionReceipt_pkey" PRIMARY KEY ("id")
);

-- tenantId-leading indexes required by the schema-index-coverage guardrail,
-- plus the auditLogId FK index.
CREATE INDEX IF NOT EXISTS "AgentActionReceipt_tenantId_occurredAt_idx" ON "AgentActionReceipt" ("tenantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "AgentActionReceipt_tenantId_mcpKeyId_idx"   ON "AgentActionReceipt" ("tenantId", "mcpKeyId");
CREATE INDEX IF NOT EXISTS "AgentActionReceipt_auditLogId_idx"          ON "AgentActionReceipt" ("auditLogId");

-- ─── 2. Foreign keys ────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE "AgentActionReceipt" ADD CONSTRAINT "AgentActionReceipt_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AgentActionReceipt" ADD CONSTRAINT "AgentActionReceipt_auditLogId_fkey"
        FOREIGN KEY ("auditLogId") REFERENCES "AuditLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. RLS (standard non-nullable-tenant triple) ───────────────────
ALTER TABLE "AgentActionReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentActionReceipt" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "AgentActionReceipt";
CREATE POLICY tenant_isolation ON "AgentActionReceipt"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AgentActionReceipt";
CREATE POLICY tenant_isolation_insert ON "AgentActionReceipt"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AgentActionReceipt";
CREATE POLICY superuser_bypass ON "AgentActionReceipt"
    USING (current_setting('role') != 'app_user');

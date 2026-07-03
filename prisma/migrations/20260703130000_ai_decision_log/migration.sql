-- ═══════════════════════════════════════════════════════════════════
-- AI decision log (EU AI Act Art 12 record-keeping + AI-ops).
--
-- One tenant-scoped, append-only table: one row per AI-feature invocation.
-- The core record is immutable (a trigger blocks edits); only the humanOutcome
-- stamp may transition ONCE, PENDING → terminal (the Art 14 human-oversight
-- feedback loop). Class-A direct-scoped RLS — canonical three-policy setup +
-- FORCE ROW LEVEL SECURITY.
-- ═══════════════════════════════════════════════════════════════════

-- ── Enum ───────────────────────────────────────────────────────────

CREATE TYPE "AiHumanOutcome" AS ENUM ('PENDING', 'ACCEPTED', 'EDITED', 'REJECTED');

-- ── Table ──────────────────────────────────────────────────────────

CREATE TABLE "AiDecisionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "aiSystemId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "inputDigest" TEXT NOT NULL,
    "outputSummary" TEXT,
    "latencyMs" INTEGER,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "guardVerdict" TEXT,
    "humanOutcome" "AiHumanOutcome" NOT NULL DEFAULT 'PENDING',
    "sessionRef" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDecisionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiDecisionLog_tenantId_createdAt_idx" ON "AiDecisionLog"("tenantId", "createdAt");
CREATE INDEX "AiDecisionLog_tenantId_aiSystemId_idx" ON "AiDecisionLog"("tenantId", "aiSystemId");
CREATE INDEX "AiDecisionLog_tenantId_sessionRef_idx" ON "AiDecisionLog"("tenantId", "sessionRef");

ALTER TABLE "AiDecisionLog"
    ADD CONSTRAINT "AiDecisionLog_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiDecisionLog"
    ADD CONSTRAINT "AiDecisionLog_aiSystemId_fkey"
    FOREIGN KEY ("aiSystemId") REFERENCES "AiSystem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Append-only immutability trigger ───────────────────────────────
-- The core record is a compliance artifact (Art 12) — it must never be
-- rewritten. The ONLY permitted mutation is a one-way humanOutcome stamp
-- (PENDING → terminal), which is the Art 14 human-oversight feedback.

CREATE OR REPLACE FUNCTION ai_decision_log_immutable() RETURNS trigger AS $$
BEGIN
    -- Every column EXCEPT humanOutcome must be unchanged.
    IF ROW(NEW."id", NEW."tenantId", NEW."feature", NEW."aiSystemId", NEW."provider",
           NEW."model", NEW."inputDigest", NEW."outputSummary", NEW."latencyMs",
           NEW."tokensIn", NEW."tokensOut", NEW."guardVerdict", NEW."sessionRef",
           NEW."userId", NEW."createdAt")
       IS DISTINCT FROM
       ROW(OLD."id", OLD."tenantId", OLD."feature", OLD."aiSystemId", OLD."provider",
           OLD."model", OLD."inputDigest", OLD."outputSummary", OLD."latencyMs",
           OLD."tokensIn", OLD."tokensOut", OLD."guardVerdict", OLD."sessionRef",
           OLD."userId", OLD."createdAt")
    THEN
        RAISE EXCEPTION 'AiDecisionLog is append-only; only humanOutcome may transition';
    END IF;

    -- humanOutcome is a one-way stamp: it may leave PENDING exactly once.
    IF NEW."humanOutcome" IS DISTINCT FROM OLD."humanOutcome"
       AND OLD."humanOutcome" <> 'PENDING' THEN
        RAISE EXCEPTION 'AiDecisionLog.humanOutcome already recorded (append-only)';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_decision_log_immutable_trg ON "AiDecisionLog";
CREATE TRIGGER ai_decision_log_immutable_trg
    BEFORE UPDATE ON "AiDecisionLog"
    FOR EACH ROW EXECUTE FUNCTION ai_decision_log_immutable();

-- ── Row Level Security ─────────────────────────────────────────────

ALTER TABLE "AiDecisionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiDecisionLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AiDecisionLog";
CREATE POLICY tenant_isolation ON "AiDecisionLog"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AiDecisionLog";
CREATE POLICY tenant_isolation_insert ON "AiDecisionLog"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AiDecisionLog";
CREATE POLICY superuser_bypass ON "AiDecisionLog"
    USING (current_setting('role') != 'app_user');

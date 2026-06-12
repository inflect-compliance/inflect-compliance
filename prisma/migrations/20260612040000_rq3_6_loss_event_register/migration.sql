-- ═══════════════════════════════════════════════════════════════════
-- RQ3-6 — LossEvent register: forecasts meet reality
-- ═══════════════════════════════════════════════════════════════════
--
-- The system predicts losses everywhere (FAIR ALE, Monte Carlo
-- P50/P90, LEC). `LossEvent` is where the world's answer comes back,
-- so the forecasting stack becomes falsifiable. Same canonical
-- Class-A RLS shape every direct-tenantId table uses:
-- `tenant_isolation` (USING + a paired INSERT WITH CHECK) +
-- `superuser_bypass` for the operational `postgres` role
-- (migrations, seeds, admin reads). IDEMPOTENT — safe to re-run.

CREATE TYPE "LossEventSource" AS ENUM ('USER', 'FINDING', 'INCIDENT');

CREATE TABLE "LossEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "riskId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "source" "LossEventSource" NOT NULL DEFAULT 'USER',
    "justification" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "LossEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LossEvent" ADD CONSTRAINT "LossEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LossEvent" ADD CONSTRAINT "LossEvent_riskId_fkey"
    FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LossEvent_tenantId_occurredAt_idx" ON "LossEvent"("tenantId", "occurredAt");
CREATE INDEX "LossEvent_tenantId_riskId_occurredAt_idx" ON "LossEvent"("tenantId", "riskId", "occurredAt");
CREATE INDEX "LossEvent_tenantId_createdAt_idx" ON "LossEvent"("tenantId", "createdAt");

ALTER TABLE "LossEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LossEvent" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "LossEvent";
CREATE POLICY tenant_isolation ON "LossEvent"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS tenant_isolation_insert ON "LossEvent";
CREATE POLICY tenant_isolation_insert ON "LossEvent"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS superuser_bypass ON "LossEvent";
CREATE POLICY superuser_bypass ON "LossEvent"
    USING (current_setting('role') != 'app_user');

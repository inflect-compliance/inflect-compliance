-- RQ2-1 — per-mutation score provenance ledger + residual decomposition.

-- Enums.
CREATE TYPE "RiskScoreEventKind" AS ENUM ('INHERENT', 'RESIDUAL');
CREATE TYPE "RiskScoreEventSource" AS ENUM ('USER', 'DERIVED', 'PLAN', 'AI', 'MIGRATION');

-- Residual decomposed into its dimensions (nullable; legacy rows
-- carry only the rolled-up residualScore).
ALTER TABLE "Risk" ADD COLUMN "residualLikelihood" INTEGER;
ALTER TABLE "Risk" ADD COLUMN "residualImpact" INTEGER;

-- The ledger.
CREATE TABLE "RiskScoreEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "kind" "RiskScoreEventKind" NOT NULL,
    "likelihood" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "source" "RiskScoreEventSource" NOT NULL,
    "justification" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskScoreEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiskScoreEvent_tenantId_riskId_createdAt_idx" ON "RiskScoreEvent"("tenantId", "riskId", "createdAt");
CREATE INDEX "RiskScoreEvent_tenantId_createdAt_idx" ON "RiskScoreEvent"("tenantId", "createdAt");
CREATE INDEX "RiskScoreEvent_tenantId_kind_createdAt_idx" ON "RiskScoreEvent"("tenantId", "kind", "createdAt");
ALTER TABLE "RiskScoreEvent" ADD CONSTRAINT "RiskScoreEvent_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskScoreEvent" ADD CONSTRAINT "RiskScoreEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── RLS (tenant isolation) — same shape as RiskSnapshot (RQ-9) ──
ALTER TABLE "RiskScoreEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskScoreEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RiskScoreEvent";
CREATE POLICY tenant_isolation ON "RiskScoreEvent" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "RiskScoreEvent";
CREATE POLICY tenant_isolation_insert ON "RiskScoreEvent" FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "RiskScoreEvent";
CREATE POLICY superuser_bypass ON "RiskScoreEvent" USING (current_setting('role') != 'app_user');

-- ── Backfill — one MIGRATION-source event per existing assessment ──
-- INHERENT anchor for every live risk (current likelihood/impact/
-- inherentScore as the opening ledger entry).
INSERT INTO "RiskScoreEvent" ("id", "tenantId", "riskId", "kind", "likelihood", "impact", "score", "source", "justification", "createdAt")
SELECT
    'rqse_mig_i_' || "id",
    "tenantId",
    "id",
    'INHERENT'::"RiskScoreEventKind",
    "likelihood",
    "impact",
    "inherentScore",
    'MIGRATION'::"RiskScoreEventSource",
    'RQ2-1 backfill — opening inherent assessment from pre-provenance data',
    COALESCE("updatedAt", "createdAt")
FROM "Risk";

-- RESIDUAL anchor for risks that already carry a divisor-era
-- residualScore. Dimensions unknown pre-RQ2-1 → recorded as 0/0
-- sentinel (the UI treats 0 as "not decomposed"); score preserved.
INSERT INTO "RiskScoreEvent" ("id", "tenantId", "riskId", "kind", "likelihood", "impact", "score", "source", "justification", "createdAt")
SELECT
    'rqse_mig_r_' || "id",
    "tenantId",
    "id",
    'RESIDUAL'::"RiskScoreEventKind",
    0,
    0,
    "residualScore",
    'MIGRATION'::"RiskScoreEventSource",
    'RQ2-1 backfill — divisor-era residual score (dimensions not decomposed)',
    COALESCE("residualScoreSetAt", "updatedAt", "createdAt")
FROM "Risk"
WHERE "residualScore" IS NOT NULL;

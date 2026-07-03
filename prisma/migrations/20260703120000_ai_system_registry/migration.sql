-- ═══════════════════════════════════════════════════════════════════
-- EU AI Act — AI-System Registry (Regulation (EU) 2024/1689).
--
-- Two new tenant-scoped tables:
--   • AiSystem                — the register of each AI system a tenant
--     provides/deploys, with its risk-tier classification.
--   • AiSystemRequirementLink — the join to the AI-Act / ISO 42001
--     obligations that the tier pulls in (mirrors ControlRequirementLink).
--
-- Three new enums (AiDeploymentRole, AiRiskTier, AiSystemStatus).
--
-- Class-A direct-scoped RLS — canonical three-policy setup
--   tenant_isolation        (USING)
--   tenant_isolation_insert (FOR INSERT WITH CHECK)
--   superuser_bypass        (USING role != 'app_user')
-- plus FORCE ROW LEVEL SECURITY — on BOTH tables. Mirrors
-- 20260507140000_epic_g5_control_exceptions.
--
-- The composite unique (id, tenantId) on AiSystem supports the composite-FK
-- shape Prisma generates for AiSystemRequirementLink → AiSystem, so a link
-- can never point at a system in another tenant.
-- ═══════════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────

CREATE TYPE "AiDeploymentRole" AS ENUM ('PROVIDER', 'DEPLOYER');
CREATE TYPE "AiRiskTier" AS ENUM ('PROHIBITED', 'HIGH', 'LIMITED', 'MINIMAL');
CREATE TYPE "AiSystemStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- ── AiSystem ───────────────────────────────────────────────────────

CREATE TABLE "AiSystem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "useContext" TEXT,
    "provider" TEXT,
    "deploymentRole" "AiDeploymentRole" NOT NULL DEFAULT 'DEPLOYER',
    "riskTier" "AiRiskTier" NOT NULL DEFAULT 'MINIMAL',
    "classificationClauseId" TEXT,
    "classificationRationale" TEXT,
    "ownerUserId" TEXT,
    "status" "AiSystemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSystem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiSystem_id_tenantId_key" ON "AiSystem"("id", "tenantId");
CREATE INDEX "AiSystem_tenantId_riskTier_idx" ON "AiSystem"("tenantId", "riskTier");
CREATE INDEX "AiSystem_tenantId_status_idx" ON "AiSystem"("tenantId", "status");
CREATE INDEX "AiSystem_tenantId_deletedAt_idx" ON "AiSystem"("tenantId", "deletedAt");
CREATE INDEX "AiSystem_tenantId_createdAt_idx" ON "AiSystem"("tenantId", "createdAt");

ALTER TABLE "AiSystem"
    ADD CONSTRAINT "AiSystem_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── AiSystemRequirementLink ────────────────────────────────────────

CREATE TABLE "AiSystemRequirementLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aiSystemId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSystemRequirementLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiSystemRequirementLink_aiSystemId_requirementId_key" ON "AiSystemRequirementLink"("aiSystemId", "requirementId");
CREATE INDEX "AiSystemRequirementLink_tenantId_requirementId_idx" ON "AiSystemRequirementLink"("tenantId", "requirementId");
CREATE INDEX "AiSystemRequirementLink_tenantId_aiSystemId_idx" ON "AiSystemRequirementLink"("tenantId", "aiSystemId");

-- Composite FK to AiSystem(id, tenantId): a link can never point at a system
-- in another tenant.
ALTER TABLE "AiSystemRequirementLink"
    ADD CONSTRAINT "AiSystemRequirementLink_aiSystemId_tenantId_fkey"
    FOREIGN KEY ("aiSystemId", "tenantId") REFERENCES "AiSystem"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiSystemRequirementLink"
    ADD CONSTRAINT "AiSystemRequirementLink_requirementId_fkey"
    FOREIGN KEY ("requirementId") REFERENCES "FrameworkRequirement"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiSystemRequirementLink"
    ADD CONSTRAINT "AiSystemRequirementLink_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row Level Security — AiSystem ──────────────────────────────────

ALTER TABLE "AiSystem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiSystem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AiSystem";
CREATE POLICY tenant_isolation ON "AiSystem"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AiSystem";
CREATE POLICY tenant_isolation_insert ON "AiSystem"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AiSystem";
CREATE POLICY superuser_bypass ON "AiSystem"
    USING (current_setting('role') != 'app_user');

-- ── Row Level Security — AiSystemRequirementLink ───────────────────

ALTER TABLE "AiSystemRequirementLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiSystemRequirementLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AiSystemRequirementLink";
CREATE POLICY tenant_isolation ON "AiSystemRequirementLink"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "AiSystemRequirementLink";
CREATE POLICY tenant_isolation_insert ON "AiSystemRequirementLink"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "AiSystemRequirementLink";
CREATE POLICY superuser_bypass ON "AiSystemRequirementLink"
    USING (current_setting('role') != 'app_user');

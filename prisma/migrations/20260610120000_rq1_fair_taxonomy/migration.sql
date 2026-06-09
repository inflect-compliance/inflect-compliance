-- RQ-1 — FAIR taxonomy decomposition on Risk (additive, all nullable).
CREATE TYPE "FairConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

ALTER TABLE "Risk"
  ADD COLUMN "threatEventFrequency" DOUBLE PRECISION,
  ADD COLUMN "contactFrequency" DOUBLE PRECISION,
  ADD COLUMN "probabilityOfAction" DOUBLE PRECISION,
  ADD COLUMN "vulnerabilityProbability" DOUBLE PRECISION,
  ADD COLUMN "threatCapability" DOUBLE PRECISION,
  ADD COLUMN "controlStrength" DOUBLE PRECISION,
  ADD COLUMN "primaryLossMagnitude" DOUBLE PRECISION,
  ADD COLUMN "productivityLoss" DOUBLE PRECISION,
  ADD COLUMN "responseCost" DOUBLE PRECISION,
  ADD COLUMN "replacementCost" DOUBLE PRECISION,
  ADD COLUMN "secondaryLossEventFrequency" DOUBLE PRECISION,
  ADD COLUMN "secondaryLossMagnitude" DOUBLE PRECISION,
  ADD COLUMN "regulatoryFineEstimate" DOUBLE PRECISION,
  ADD COLUMN "reputationDamageEstimate" DOUBLE PRECISION,
  ADD COLUMN "competitiveAdvantageLoss" DOUBLE PRECISION,
  ADD COLUMN "lossEventFrequency" DOUBLE PRECISION,
  ADD COLUMN "fairAle" DOUBLE PRECISION,
  ADD COLUMN "fairConfidence" "FairConfidence",
  ADD COLUMN "fairInputsJson" JSONB,
  ADD COLUMN "fairComputedAt" TIMESTAMP(3);

CREATE INDEX "Risk_tenantId_fairAle_idx" ON "Risk"("tenantId", "fairAle");
CREATE INDEX "Risk_tenantId_lossEventFrequency_idx" ON "Risk"("tenantId", "lossEventFrequency");
CREATE INDEX "Risk_tenantId_fairConfidence_idx" ON "Risk"("tenantId", "fairConfidence");

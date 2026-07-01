-- Nis2 gap-assessment lifecycle: distinguish the wizard baseline run from
-- later standalone re-assessments, and index runs chronologically for history.

-- AddColumn (default STANDALONE; existing rows are treated as standalone —
-- the wizard-completion path stamps WIZARD_BASELINE on the baseline row).
ALTER TABLE "Nis2SelfAssessment" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'STANDALONE';

-- CreateIndex — chronological run history per tenant.
CREATE INDEX IF NOT EXISTS "Nis2SelfAssessment_tenantId_createdAt_idx" ON "Nis2SelfAssessment"("tenantId", "createdAt");

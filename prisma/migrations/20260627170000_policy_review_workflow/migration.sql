-- Policy review workflow + evidence-to-retain linkage.

-- 1) Policy.lastReviewedAt — periodic re-validation timestamp.
ALTER TABLE "Policy" ADD COLUMN "lastReviewedAt" TIMESTAMP(3);

-- 2) PolicyEvidenceItem — evidence-to-retain checklist (tenant-scoped).
CREATE TABLE "PolicyEvidenceItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "evidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyEvidenceItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PolicyEvidenceItem_tenantId_idx" ON "PolicyEvidenceItem"("tenantId");
CREATE INDEX "PolicyEvidenceItem_tenantId_policyId_idx" ON "PolicyEvidenceItem"("tenantId", "policyId");
CREATE INDEX "PolicyEvidenceItem_evidenceId_idx" ON "PolicyEvidenceItem"("evidenceId");

-- FK to Policy via composite (id, tenantId) — matches the tenant-scoped
-- parent pattern (PolicyControlLink), cascade on policy delete.
ALTER TABLE "PolicyEvidenceItem"
    ADD CONSTRAINT "PolicyEvidenceItem_policyId_tenantId_fkey"
    FOREIGN KEY ("policyId", "tenantId") REFERENCES "Policy"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FK to Evidence — nullable link; clear the link if the evidence is deleted.
ALTER TABLE "PolicyEvidenceItem"
    ADD CONSTRAINT "PolicyEvidenceItem_evidenceId_fkey"
    FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PolicyEvidenceItem"
    ADD CONSTRAINT "PolicyEvidenceItem_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) RLS — canonical Class-A (direct tenantId column).
ALTER TABLE "PolicyEvidenceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyEvidenceItem" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "PolicyEvidenceItem";
CREATE POLICY tenant_isolation ON "PolicyEvidenceItem"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "PolicyEvidenceItem";
CREATE POLICY tenant_isolation_insert ON "PolicyEvidenceItem"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

DROP POLICY IF EXISTS superuser_bypass ON "PolicyEvidenceItem";
CREATE POLICY superuser_bypass ON "PolicyEvidenceItem"
    USING (current_setting('role') != 'app_user');

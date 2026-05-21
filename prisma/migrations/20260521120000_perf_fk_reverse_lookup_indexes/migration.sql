-- Foreign-key reverse-lookup indexes.
--
-- Closes the 8 R_TODO_INDEX gaps surfaced by the Layer B index
-- guardrail (tests/guardrails/schema-index-coverage.test.ts). Each FK
-- below previously had no index serving a "list rows by this parent"
-- lookup — a sequential scan. Six are tenant-scoped composites
-- ([tenantId, fk] — the universal WHERE tenantId=? AND fk=? shape);
-- PolicyApproval is ownership-chained (no tenantId) so its FKs get
-- standalone single-column indexes.
--
-- IF NOT EXISTS keeps the migration idempotent on a drifted DB.

-- RiskControl: "risks linked to control X" (traceability panel).
CREATE INDEX IF NOT EXISTS "RiskControl_tenantId_controlId_idx" ON "RiskControl"("tenantId", "controlId");

-- ControlAsset: "controls covering asset X" (asset detail).
CREATE INDEX IF NOT EXISTS "ControlAsset_tenantId_assetId_idx" ON "ControlAsset"("tenantId", "assetId");

-- AssetRiskLink: "assets exposed to risk X" (risk detail).
CREATE INDEX IF NOT EXISTS "AssetRiskLink_tenantId_riskId_idx" ON "AssetRiskLink"("tenantId", "riskId");

-- PolicyApproval: approvals for a policy / a policy version.
CREATE INDEX IF NOT EXISTS "PolicyApproval_policyId_idx" ON "PolicyApproval"("policyId");
CREATE INDEX IF NOT EXISTS "PolicyApproval_policyVersionId_idx" ON "PolicyApproval"("policyVersionId");

-- Finding: "findings raised in audit X" (audit detail).
CREATE INDEX IF NOT EXISTS "Finding_tenantId_auditId_idx" ON "Finding"("tenantId", "auditId");

-- ControlTestRun: "test runs for control X" (control detail).
CREATE INDEX IF NOT EXISTS "ControlTestRun_tenantId_controlId_idx" ON "ControlTestRun"("tenantId", "controlId");

-- VendorRelationship: "primary vendors using subprocessor X".
CREATE INDEX IF NOT EXISTS "VendorRelationship_tenantId_subprocessorVendorId_idx" ON "VendorRelationship"("tenantId", "subprocessorVendorId");

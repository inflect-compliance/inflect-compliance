-- feat/audit-cycle-unify — link the classic Audit (fieldwork) to the
-- AuditCycle spine. NULLABLE column so standalone audits still work;
-- ON DELETE SET NULL so deleting a cycle detaches (never deletes) its
-- fieldwork audits. No RLS change: Audit already carries tenant_isolation
-- + FORCE ROW LEVEL SECURITY; a new nullable column inherits both.

ALTER TABLE "Audit" ADD COLUMN "auditCycleId" TEXT;

-- FK index required by the schema-index-coverage guardrail (Layer B).
CREATE INDEX "Audit_tenantId_auditCycleId_idx" ON "Audit"("tenantId", "auditCycleId");

ALTER TABLE "Audit"
    ADD CONSTRAINT "Audit_auditCycleId_fkey"
    FOREIGN KEY ("auditCycleId") REFERENCES "AuditCycle"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

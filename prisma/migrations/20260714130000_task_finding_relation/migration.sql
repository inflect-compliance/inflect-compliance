-- TP-3 (Tasks roadmap) — promote the Finding↔Task link from a
-- `metadataJson.findingId` string to a first-class FK relation so
-- `reconcileTaskSource` can close the linked Finding when an
-- AUDIT_FINDING task reaches a terminal RESOLVED/CLOSED state.
--
-- Nullable column; ON DELETE SET NULL so deleting a Finding never
-- deletes or orphans its remediation tasks. No RLS change: Task
-- already carries tenant_isolation + FORCE ROW LEVEL SECURITY; a
-- new nullable column inherits both.

ALTER TABLE "Task" ADD COLUMN "findingId" TEXT;

-- FK index required by the schema-index-coverage guardrail (Layer B)
-- + the "tasks for this finding" reconciliation lookup.
CREATE INDEX "Task_tenantId_findingId_idx" ON "Task"("tenantId", "findingId");

ALTER TABLE "Task"
    ADD CONSTRAINT "Task_findingId_fkey"
    FOREIGN KEY ("findingId") REFERENCES "Finding"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill the FK from the legacy metadataJson pointer for existing
-- AUDIT_FINDING tasks. Guard on a valid, same-tenant Finding id so a
-- stale / cross-tenant metadata value never creates a dangling FK.
UPDATE "Task" t
SET "findingId" = (t."metadataJson"->>'findingId')
FROM "Finding" f
WHERE t."type" = 'AUDIT_FINDING'
  AND t."metadataJson" ? 'findingId'
  AND f."id" = (t."metadataJson"->>'findingId')
  AND f."tenantId" = t."tenantId";

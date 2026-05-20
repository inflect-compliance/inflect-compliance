-- #102 item 4 — Task index review.
--
-- Drop `[tenantId, dueAt]` — it is a strict prefix of
-- `[tenantId, dueAt, status]`, so the planner never needs both.
-- Add `[tenantId, controlId, status]` — the control-detail Tasks
-- tab filters by both `controlId` AND `status`; the existing
-- `[tenantId, controlId]` index can't serve the status predicate.

-- DropIndex
DROP INDEX "Task_tenantId_dueAt_idx";

-- CreateIndex
CREATE INDEX "Task_tenantId_controlId_status_idx" ON "Task"("tenantId", "controlId", "status");

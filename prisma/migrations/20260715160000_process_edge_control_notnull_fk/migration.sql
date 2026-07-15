-- PR-D — make an edge-mounted control a REAL control.
--
-- Before: ProcessEdgeControl.controlId was nullable, a placeholder for the
-- "control-shaped label with no linkage" the retired single-click affordance
-- stamped. After 1.1 the only way to attach a control to an edge is the
-- inspector's Control picker, which always selects a real Control — so
-- controlId is required and carries a real foreign key.

-- 1. Drop any orphan rows that never linked to a real Control (defensive —
--    the inspector picker always sets controlId, so in practice this is a
--    no-op, but a pre-PR-D edge could carry a null-controlId row).
DELETE FROM "ProcessEdgeControl" WHERE "controlId" IS NULL;

-- 2. controlId is now required.
ALTER TABLE "ProcessEdgeControl" ALTER COLUMN "controlId" SET NOT NULL;

-- 3. Real FK to Control; deleting a Control cascades away its edge attachments.
ALTER TABLE "ProcessEdgeControl" ADD CONSTRAINT "ProcessEdgeControl_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

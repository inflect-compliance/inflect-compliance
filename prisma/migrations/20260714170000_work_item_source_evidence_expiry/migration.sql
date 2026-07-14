-- Tasks roadmap TP-5: make /tasks a universal inbox.
-- Evidence-expiry reminders now materialise as first-class Task rows, so
-- the WorkItemSource enum gains a dedicated value to tag + filter them.
--
-- NOTE: PostgreSQL cannot add a new enum value AND use it in the same
-- transaction. This migration ONLY adds the value (a bare ADD VALUE runs
-- safely on its own); the first write that stamps `EVIDENCE_EXPIRY` lands
-- in a later transaction (the retention-notifications sweep at runtime).
-- `IF NOT EXISTS` keeps the migration idempotent across re-applies.
ALTER TYPE "WorkItemSource" ADD VALUE IF NOT EXISTS 'EVIDENCE_EXPIRY';

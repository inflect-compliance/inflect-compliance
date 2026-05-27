-- 2026-05-27 — Notification streaming/alerts roadmap PR-A.
--
-- Add `CONTROL_ASSIGNED` to the `NotificationType` enum. Wired by
-- `setControlOwner` in `src/app-layer/usecases/control/mutations.ts`
-- so the new owner sees an in-app bell notification the moment
-- ownership transfers. Mirrors the pre-existing `TASK_ASSIGNED`
-- shape for tasks.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTROL_ASSIGNED';

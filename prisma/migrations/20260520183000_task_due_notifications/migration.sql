-- Task-due notifications.
--
-- Adds the `TASK_DUE` in-app notification type and an optional
-- idempotency key on `Notification`. The `task-due-notification`
-- job (daily 08:00 UTC) writes one `TASK_DUE` row per task at each
-- reminder window (one week before / one day before / due day).
--
-- `dedupeKey` mirrors `NotificationOutbox.dedupeKey`: a unique key so
-- a job re-run (retry, redeploy) within the same UTC day trips the
-- unique index instead of creating a duplicate. NULL for every
-- interactive / event-driven notification writer — the partial set
-- of NULLs is allowed because Postgres treats NULLs as distinct in a
-- unique index.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DUE';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

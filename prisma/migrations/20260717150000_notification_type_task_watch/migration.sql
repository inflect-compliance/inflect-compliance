-- TP-2 — bell notification type for task-watcher activity fan-out.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_WATCH_UPDATE';

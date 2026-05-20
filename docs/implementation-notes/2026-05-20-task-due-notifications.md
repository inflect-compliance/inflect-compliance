# 2026-05-20 — Task-due notifications

**Commit:** `<pending> feat(tasks): in-app TASK_DUE notifications at 7d / 1d / due day`

## Problem

Tasks carry a `dueAt`, but nothing wrote to the in-app notification
bell when a deadline arrived — a tenant with tasks due today saw no
notification. The email side was covered (the `notification-dispatch`
deadline digest includes tasks), but the `Notification` table was only
ever written by evidence approval/rejection. The bell was silent for
task deadlines.

## Design

A new scheduled job, `task-due-notification`, runs daily at **08:00
UTC** — the start of the working day — and writes one in-app
`Notification` (type `TASK_DUE`) per task at each of three reminder
windows:

| Window  | Trigger                              | Title                 |
|---------|--------------------------------------|-----------------------|
| `week`  | `dueAt` is 7 UTC calendar days out   | Task due in one week  |
| `day`   | `dueAt` is 1 UTC calendar day out    | Task due tomorrow     |
| `today` | `dueAt` is the current UTC day       | Task due today        |

The recipient is the task's **assignee**. Classification is by UTC
calendar day, not millisecond delta — a task due "tomorrow at 23:00"
still reads as the one-day window when the job fires at 08:00. Days
2-6 produce nothing; the three touchpoints are the spec.

The job has the standard two scope modes (mirrors
`access-review-reminder` / `policyReviewReminder`): a `tenantId`
scopes the scan to one tenant; omitting it scans every tenant (the
nightly cron path).

**Idempotency.** `Notification` gained an optional unique `dedupeKey`
column (mirrors `NotificationOutbox.dedupeKey`). The job's key is
`{tenantId}:TASK_DUE:{window}:{taskId}:{userId}:{YYYY-MM-DD}`. A
re-run within the same UTC day trips the unique index; the insert is
caught (P2002) and counted as `skippedDuplicate`. A task matches at
most one window per run, so over its life it yields at most three
notifications. `dedupeKey` is left NULL by every interactive /
event-driven notification writer — they don't dedupe, and Postgres
treats NULLs as distinct in a unique index.

In-app only — the email deadline digest already covers these
deadlines over email.

## Files

| File | Role |
|------|------|
| `prisma/schema/enums.prisma` | New `NotificationType.TASK_DUE` value |
| `prisma/schema/automation.prisma` | New `Notification.dedupeKey String? @unique` |
| `prisma/migrations/20260520183000_task_due_notifications/` | Enum value + column + unique index |
| `src/app-layer/jobs/task-due-notification.ts` | The job — window math + scan/notify |
| `src/app-layer/jobs/types.ts` | `TaskDueNotificationPayload` + map + `JOB_DEFAULTS` entry |
| `src/app-layer/jobs/executor-registry.ts` | Executor registration |
| `src/app-layer/jobs/schedules.ts` | `0 8 * * *` schedule entry |
| `tests/unit/task-due-notification.test.ts` | Window math + scan/notify behaviour (mocked Prisma) |
| `tests/integration/task-due-notification.test.ts` | End-to-end against a real DB + the `dedupeKey` index |
| `tests/unit/job-tenant-isolation-regression.test.ts` | Added a tenant-isolation regression block |

## Decisions

- **New `TASK_DUE` enum value rather than reusing `GENERAL`.** It
  sits beside `TASK_ASSIGNED` and keeps the notification semantically
  queryable. The bell renders title/message generically, so no UI
  switch needed updating.
- **Calendar-day classification, not a millisecond window.** A daily
  08:00 batch job is inherently calendar-grained; classifying by UTC
  day makes the {7,1,0} touchpoints exact and time-of-day-proof.
- **`dedupeKey` as a real unique column, not a query-and-skip.** The
  codebase already enforces notification idempotency this way for the
  email outbox; a DB-enforced key is retry-safe and redeploy-safe
  where a pre-query would race.
- **Assignee only.** The assignee is the responsible party and the
  same recipient `TASK_ASSIGNED` uses. Unassigned tasks are filtered
  out at the query — there is no recipient.
- **Separate job, not folded into `notification-dispatch`.** That
  pipeline runs at 07:00 and emits 30-day-horizon email digests;
  "due today / tomorrow / next week" at 08:00 is a distinct,
  in-app-only concern with its own precise windows.
- **08:00 UTC.** Matches `policy-review-reminder` and the existing
  "start of the working day" convention; the job is calendar-day
  based so exact firing time is not load-bearing.

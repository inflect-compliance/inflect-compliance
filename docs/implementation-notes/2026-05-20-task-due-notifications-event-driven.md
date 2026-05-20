# 2026-05-20 — Task-due notifications: the event-driven path

**Commit:** `<pending> fix(tasks): emit TASK_DUE notification on create/update/assign`

## Problem

[#592](docs/implementation-notes/2026-05-20-task-due-notifications.md)
shipped in-app `TASK_DUE` notifications as a **daily 08:00 UTC cron
only**. A tenant (`inflect ltd`) still saw no notification for tasks
due today / tomorrow. Two failure modes left the cron silent:

1. **Scheduler-dependent.** The 08:00 repeatable only fires if the
   deploy-time scheduler registered it AND a BullMQ worker is running.
   If either is down, no `TASK_DUE` row is ever written. The cron is
   the *only* writer — there is no fallback.
2. **Never fires for same-day tasks created after 08:00.** A task
   created at 14:00 with `dueAt` today is already past the day's only
   scan. Its `today` window is missed forever; the next scan (next
   08:00) classifies it as overdue (`days < 0` → no window).

The cron is correct for the *steady state* — it is the wrong and only
mechanism for *the moment a deadline becomes near-term*.

## Design

Add an **event-driven path** alongside the cron, sharing one writer so
the two never double-notify.

```
  createTask ─┐  (after the task txn commits)
  updateTask ─┼─▶ emitTaskDueNotification ─▶ runInTenantContext ─▶ createTaskDueNotification ─▶ Notification
  assignTask ─┘     (usecase, fire-&-forget)    (own short txn)       (shared helper)     createMany + skipDuplicates
                                                                            ▲
  08:00 cron ─────────────── processTaskDueNotifications ────────────────────┘
```

`createTaskDueNotification(db, task, now)` is extracted from the cron
loop into an exported helper in `task-due-notification.ts`. It
classifies one task's `dueAt` into a {7,1,0}-day window and inserts
the `Notification` — returning `{ status: 'created' | 'duplicate' |
'out-of-window', window }`. The cron loop now calls it per scanned
task; the task usecases call it the instant a task is created,
rescheduled, or (re)assigned.

**Idempotency carries the whole design.** Both paths mint the same
`dedupeKey` (`{tenantId}:TASK_DUE:{window}:{taskId}:{userId}:{YYYY-MM-DD}`).
The insert is a `createMany` with `skipDuplicates` — `INSERT ... ON
CONFLICT DO NOTHING`. A task created at 14:00 today gets its `today`
notification immediately from the usecase; the next 08:00 cron
re-attempts, the conflict is absorbed at the SQL layer (`count: 0`),
and it is counted `skippedDuplicate`. No double-bell, ever — and,
critically, **no exception** (see Decisions).

**`emitTaskDueNotification`** is the usecase-side wrapper: a private
`task.ts` helper that early-returns when the task has no assignee, no
`dueAt`, or the context has no `tenantSlug` (the `linkUrl` needs it).
It runs **after the task's own transaction has committed**, opening
its own short `runInTenantContext` transaction, inside a `try/catch`
that logs a warning and **never throws**. A notification failure must
not roll back the task write that triggered it — the cron is the
backstop.

## Files

| File | Role |
|------|------|
| `src/app-layer/notifications/task-due.ts` | **NEW** — shared window math + `createTaskDueNotification` writer (`createMany` + `skipDuplicates`). Neutral module both the cron and the usecase depend on |
| `src/app-layer/jobs/task-due-notification.ts` | Cron scan loop only; consumes + re-exports the shared helper |
| `src/app-layer/usecases/task.ts` | `emitTaskDueNotification` wrapper (post-commit, own txn); wired into `createTask` / `updateTask` / `assignTask` |
| `tests/unit/task-due-notification.test.ts` | `createTaskDueNotification` + cron behaviour against a mocked `createMany` |
| `tests/guards/task-due-notification-wiring.test.ts` | Structural ratchet — helper in `notifications/`, `createMany`+`skipDuplicates`, usecase imports from `notifications/` not `jobs/`, 3 call sites |

## Decisions

- **Extract a shared helper, do not duplicate the insert.** One
  writer means one `dedupeKey` shape; the cron and the event path are
  guaranteed consistent by construction, not by review vigilance.
- **The shared helper lives in `notifications/`, not `jobs/`.** The
  task usecase is an HTTP request path; importing it from `jobs/`
  pulls the job module graph into the request bundle. The first cut
  put the helper in `jobs/task-due-notification.ts` and imported it
  into `task.ts` — that perturbed the `/api/t/.../tasks` route bundle
  and broke `createTask` (the `issues.spec` E2E went red even though
  the runtime path is a no-op for an unassigned task). Moving the
  helper to `notifications/task-due.ts` — a neutral leaf module whose
  only import is the Prisma *type* — decouples the usecase from
  `jobs/` entirely. The cron job now consumes the same module.
- **`createMany` + `skipDuplicates`, never `create`.** This is the
  load-bearing decision. `create` throws `P2002` on a duplicate
  `dedupeKey` — and a thrown `P2002` inside a PostgreSQL interactive
  transaction poisons the *whole* transaction (`25P02`); a caught JS
  error does **not** un-poison it. The first cut of this change wrote
  the notification with `create` inside the caller's transaction; a
  duplicate `dedupeKey` then rolled back the entire `createTask` —
  surfacing as `409 CONFLICT` on task creation (caught in CI by the
  `issues.spec` E2E). `createMany` with `skipDuplicates` compiles to
  `INSERT ... ON CONFLICT DO NOTHING`: a duplicate returns `count: 0`
  with no exception, so the transaction is never poisoned.
- **Run the emit *after* the task transaction, in its own.**
  Defence in depth on top of the `createMany` fix: `emitTaskDue\
  Notification` takes `ctx` (not the transaction `db`) and opens its
  own short `runInTenantContext`. Even a genuine DB error during the
  notification write now cannot touch the task transaction — the task
  is already committed. Fire-and-forget in the true sense; the cron
  re-attempts on its next pass anyway.
- **Emit from `updateTask` too, not just create.** Rescheduling a
  task's `dueAt` into a near-term window is exactly the case the
  original cron-only design missed for same-day edits.
- **Keep the cron.** It still covers the steady-state transition
  (a task sitting untouched as its 7d → 1d → 0d windows arrive).
  Event path = "deadline set near"; cron = "deadline drifts near".
- **`tenantSlug` from `RequestContext`, guard when absent.** The
  notification `linkUrl` is `/t/{slug}/tasks/{id}`. `ctx.tenantSlug`
  is optional on `RequestContext`; when missing we skip rather than
  emit a broken link — the cron (which reads `tenant.slug` from the
  row) still covers it.

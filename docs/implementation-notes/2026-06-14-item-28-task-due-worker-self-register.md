# 2026-06-14 — item 28: task-due reminders fire reliably (worker self-registers schedules)

**Branch:** `claude/fix-28-task-due-notifications`

## Symptom

"Due task notifications still don't work — need a reminder one week
before, one day before, and on the day a task is due."

## Investigation — the code was already correct

The entire task-due notification chain was present and correct:

| Link | Location | Status |
|---|---|---|
| `TASK_DUE` enum value | `prisma/schema/enums.prisma` | present |
| Daily cron schedule (08:00, tz-aware) | `jobs/schedules.ts` | present |
| Executor handler | `jobs/executor-registry.ts:464` | present |
| Scan job (0–7 day horizon) | `jobs/task-due-notification.ts` | correct |
| Window writer (7 / 1 / 0 days, dedup, SSE) | `notifications/task-due.ts` | correct |
| Event path (instant notify on create/edit/assign) | `usecases/task.ts` ×3 | wired |
| Bell rendering | `layout/notifications-bell.tsx` | renders all types generically |

So a task created **exactly** 7, 1, or 0 days out notifies instantly via
the event path. Everything else relies on the **daily cron** to catch the
deadline as it crosses each window.

## Root cause — the cron depended on a one-shot step that drifts

The repeatable cron jobs were registered **only** by the one-shot
`scripts/scheduler.ts`, run before the worker in the deploy command
(`node scheduler && node worker`). The worker itself
(`scripts/worker.ts`) never registered schedules — it only *processed*
enqueued jobs.

Per `CLAUDE.md`, the production VM runs a **hand-managed** compose stack
that drifts from the repo, and Watchtower only updates the `app`/`worker`
*images*, never the compose structure. If that scheduler step is dropped,
reordered, or fails, the `task-due-notification` repeatable is never
registered → nothing ever enqueues the daily scan → the worker sits idle
and the reminders silently never fire. A single point of failure outside
the codebase.

## Fix — the worker self-registers schedules on boot

`upsertJobScheduler` is idempotent (BullMQ dedupes repeatables by name),
so registering on every worker boot is safe and makes **a running worker
always imply the cron schedules exist**. The one-shot scheduler step
remains for explicit/CI use, but is no longer load-bearing.

## Files

| File | Role |
|---|---|
| `src/app-layer/jobs/register-schedules.ts` | **new** — single source of truth for the `upsertJobScheduler` shape (tz + limit plumbing) |
| `scripts/worker.ts` | boot-time `registerSchedules(...)` on its own Redis connection; failure-soft (logs, never blocks the worker) |
| `scripts/scheduler.ts` | `registerAll` now delegates to the shared `registerSchedules`; the prod encryption-key check moved from a fire-and-forget IIFE to an awaited gate at the top of `main()` |
| `tests/guards/item-28-task-due-wiring.test.ts` | ratchet over the full chain |

## Decisions

- **Failure-soft on the worker side.** A registration error logs but does
  NOT stop the worker booting — it must still drain already-enqueued
  jobs. The explicit scheduler step is the loud path.
- **Separate Redis connection** for the boot-time `Queue` (BullMQ wants
  Queue and Worker on distinct connections), closed after registration.
- **Shared registrar** so the worker and the standalone scheduler can
  never drift on the upsert shape (tz / limit handling lived in one place
  already conceptually; now literally).

## Operational note (no VM access from this environment)

This change guarantees registration *going forward* — the next worker
image roll re-registers everything on boot. To register immediately
without waiting for a redeploy, run the scheduler against prod Redis:

```bash
gcloud compute ssh inflect-compliance --zone europe-west1-b --command \
  "cd /opt/inflect && sudo docker compose -f docker-compose.prod.yml run --rm worker node dist/scheduler.mjs --list"
```

`--list` shows the currently-registered repeatables; drop it to register.
`gcloud` was not available in the implementing environment, so this step
is documented rather than executed.

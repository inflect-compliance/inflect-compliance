# 2026-05-22 — Deploy the BullMQ worker + scheduler

**Commit:** `<pending> fix(deploy): run the BullMQ worker + scheduler in production`

## Design

A bug report — "task-due notifications still don't appear" — traced
to a much larger gap: **the BullMQ worker and scheduler were never
deployed in any Docker Compose path.**

The job code is correct end-to-end. The break was purely
deployment:

- `scripts/entrypoint.sh` runs only `next start`.
- No Compose file (`docker-compose.prod.yml`, `docker-compose.staging.yml`,
  `deploy/docker-compose.prod.yml`) had a `worker` service.
- The Dockerfile `runner` stage copied `entrypoint.sh` but not the
  worker scripts; `tsx` (needed to run the `.ts` entrypoints) is a
  devDependency stripped by `npm prune --omit=dev`.

Consequence: all 12 repeatable crons in `schedules.ts` never ran,
and anything the app enqueued piled up in Redis. The `task-due`
event path (`emitTaskDueNotification`, fired inline by the task
usecases) still worked — which is why *some* task-due notifications
appeared and the daily steady-state scan did not.

### The fix

**Compile the worker.** A new `scripts/build-worker.mjs` esbuild-
bundles `scripts/worker.ts` and `scripts/scheduler.ts` into
self-contained `dist/worker.mjs` + `dist/scheduler.mjs` — all `src/`
imports inlined, node_modules external. The production image then
runs plain `node dist/worker.mjs`; no `tsx`, no raw TS shipped.

**A `worker` Compose service.** Each production-like Compose file
gains a `worker` service: same image as `app`, ENTRYPOINT overridden
to `node dist/scheduler.mjs && node dist/worker.mjs` — register the
repeatable schedules (idempotent), then daemonise the worker.

**Dockerfile.** `builder` runs `npm run build:worker` after
`next build` and before the dev-dependency prune (esbuild is a
devDependency); `runner` copies `dist/`.

### Pre-existing YAML bug, fixed in passing

`docker compose config` could not parse any of the three Compose
files: the `DATA_ENCRYPTION_KEY: ${VAR:?…}` env value was unquoted
and the fail-fast message contains `: ` (colon-space), which YAML
reads as a nested mapping. The value is now double-quoted in every
`app` and `worker` service — all three files now validate.

## Files

| File | Role |
|------|------|
| `scripts/build-worker.mjs` | NEW — esbuild bundle of the worker + scheduler entrypoints. |
| `package.json` | `build:worker` script; `esbuild` devDep; `dotenv` moved to `dependencies` (the worker imports it at runtime). |
| `Dockerfile` | `builder` runs `build:worker`; `runner` ships `dist/`. |
| `docker-compose.prod.yml`, `docker-compose.staging.yml`, `deploy/docker-compose.prod.yml` | NEW `worker` service; `DATA_ENCRYPTION_KEY` env value quoted. |
| `tests/guards/worker-deployment.test.ts` | NEW — fails CI if the worker service / build step / build script is dropped. |
| `docs/deployment.md` | "Background worker" section + the VM operator action. |

## Decisions

- **Compile, not `tsx` in production.** Shipping the transpiler plus
  raw `src/` TS to a production image is larger and slower to boot.
  An esbuild bundle is two self-contained files; the runtime is
  plain `node`.

- **One image, two services.** `app` and `worker` run the *same*
  image — the worker just overrides the ENTRYPOINT. No second build,
  no image-tag coordination; `app` and `worker` always move in
  lockstep.

- **Scheduler folded into the worker's command.** `node
  dist/scheduler.mjs && node dist/worker.mjs` — the scheduler
  registers repeatables (idempotent) and exits, then the worker
  daemonises. A scheduling failure aborts the `&&` so `restart`
  retries the whole sequence; no separate one-shot service to
  orchestrate.

- **The guard is the point.** This gap survived because nothing
  asserted the worker was deployed — every test was green.
  `worker-deployment.test.ts` makes the worker's presence a CI
  invariant, so it cannot silently vanish again.

- **VM needs operator action.** `deploy/docker-compose.prod.yml` is
  the reference; the live GCP VM's `/opt/inflect/` Compose is
  hand-managed and Watchtower swaps only the image. The operator
  must add the `worker` service to the VM's Compose file and
  `docker compose up -d worker` — documented in `deployment.md`.

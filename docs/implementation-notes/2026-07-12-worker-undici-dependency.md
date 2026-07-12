# 2026-07-12 — Worker crash-loop: `undici` must be a production dependency

**Commit:** _(hotfix — prod worker crash-loop)_

## Symptom

`inflect-worker-1` in prod crash-looped: it registered all 12 cron
schedules (`all schedules registered ✓`) then died with

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'undici' imported from /app/dist/worker.mjs
```

Background jobs (snapshots, digests, deadline monitors, control-test
scheduler, …) were not running.

## Cause

`src/app-layer/automation/webhook-safety.ts` imports `undici` directly
(`import { Agent } from 'undici'` — SSRF-safe pinned dispatcher). But
`undici` was declared **only in `package.json` `overrides`** (a transitive
version pin, for the CVE floor), **not in `dependencies`**.

- The **app** (Next.js) bundles `undici` into `.next` via webpack, so it
  runs fine without `undici` in `node_modules`.
- The **worker** bundle (`scripts/build-worker.mjs`, esbuild
  `packages: 'external'`) resolves every import from the pruned production
  `node_modules` at runtime. `Dockerfile` runs `npm prune --omit=dev`, which
  dropped `undici` (present only transitively / dev), so the worker couldn't
  resolve it → crash.

## Fix

Add `undici` to `dependencies` (kept in `overrides` too for the version
pin). It now survives `npm prune --omit=dev` and is present for the worker
bundle. `npm audit --omit=dev` stays at 0 (the pinned 7.x has no production
advisory).

## Rule to remember

`scripts/build-worker.mjs` already documents it: **every package the worker
bundle imports MUST be a production `dependency`, not a `devDependency`**
(and an `overrides`-only entry does NOT count — overrides pin a version, they
don't declare a dependency). A direct `import` from any code reachable by the
worker entrypoints (`scripts/worker.ts` / `scripts/scheduler.ts`, incl. their
`src/` graph) must appear in `dependencies`.

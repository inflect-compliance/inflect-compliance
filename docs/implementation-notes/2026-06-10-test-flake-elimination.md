# 2026-06-10 — Test flake elimination (parallel-safe integration)

**Commit:** `<sha>` test(infra): eliminate parallel-run flakes (per-worker DB isolation + timeouts)

## Symptom

Integration + heavy render tests passed in isolation and in CI (`test:ci`
= `jest --runInBand`, serial) but flaked in any **parallel** run (`npm test` /
`npx jest …`): deadlocks, `Expected 16` data races, and "Exceeded timeout of
5000 ms".

## Root causes (three)

1. **`testTimeout` was set at the project level — Jest ignores that.** Only the
   root config or `jest.setTimeout()` works with `projects`. So the default 5s
   applied; DB-backed + heavy render tests blew it under contention.
2. **Integration tests share ONE database with no worker isolation** and
   `TRUNCATE` in `beforeEach`. Run in parallel, workers truncated each other's
   data mid-test → deadlocks + races. (CI only worked because it's serial.)
3. **Four resolvers disagreed on the DB URL** — `db.ts::getBaseTestDatabaseUrl`
   (container-default first), `db-helper.ts::DB_URL` (`.env`/`.env.test` first),
   `jest.setup.js` (app `DATABASE_URL`), and the env mock proxy. Once per-worker
   DBs existed, raw test clients hit one DB while the app hit another.

## Fix

- **Per-worker DB isolation.** When Jest runs >1 worker, `globalSetup`
  `CREATE DATABASE … TEMPLATE`-clones the migrated base into one DB per worker
  (`<base>_w<id>`) and writes a marker; `teardown` drops them. Serial runs / CI
  (`--runInBand`, maxWorkers=1) skip cloning and stay on the shared base DB —
  **that path is unchanged**, so CI risk is ~zero.
- **Single source of truth for the DB URL.** `getTestDatabaseUrl()` (db.ts) is
  worker-aware (reads the marker). `db-helper.ts::DB_URL` delegates to it;
  `jest.setup.js` repoints the app's `DATABASE_URL` at the same worker DB. All
  clients now agree.
- **Default timeout via `jest.setTimeout(30_000)`** in `jsdom-shims.ts` (loaded
  by both projects) — the mechanism Jest actually honours.
- **`framework-import-cli`** calls the resolved `tsx` binary directly (drops the
  `npx` cold-start layer) + 120s spawn / 150s Jest budget.
- **Perf test** (`encryption-middleware.perf.test.ts`) skips under parallel
  contention (`isParallelRun()`); its latency budgets are only meaningful
  serially, and CI runs serially so it still gates regressions.

## Validation

Full suite **in parallel** (1358 suites / 22.8k tests) green across 3 runs;
serial integration (CI path) green. The flake class is gone.

## Files

| File | Change |
| --- | --- |
| `tests/helpers/db.ts` | worker-aware URL + `isParallelRun` + URL helpers. |
| `tests/setup/globalSetup.ts` | template-clone per-worker DBs. |
| `tests/setup/teardown.ts` | drop per-worker DBs. |
| `jest.setup.js` | per-worker app `DATABASE_URL`. |
| `tests/integration/db-helper.ts` | delegate `DB_URL` to `getTestDatabaseUrl`. |
| `tests/setup/jsdom-shims.ts` | `jest.setTimeout(30_000)`. |
| `tests/integration/framework-import-cli.test.ts` | direct `tsx` + budget. |
| `tests/unit/encryption-middleware.perf.test.ts` | skip under contention. |
| `jest.config.js` | drop ineffective project-level `testTimeout`. |

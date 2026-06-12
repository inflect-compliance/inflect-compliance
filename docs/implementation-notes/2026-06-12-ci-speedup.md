# 2026-06-12 — CI speedup: shard Test + E2E, skip Coverage on PR, composite setup, larger-runner toggle

**Commit:** _(see PR — `ci: shard Test + E2E into parallel matrices; skip Coverage on PR; composite Node/Prisma setup; LARGE_RUNNER toggle`)_

## Design

CI was the slowest part of the dev loop: per-PR wall-clock ~33–38 min
before the first green check, dominated by **Test** (30 min
single-process `jest --runInBand`), **Coverage** (33 min same suite
re-run with instrumentation), and **E2E** (17 min serial Playwright).
Five structural moves cut the critical path roughly 5–6×.

### 1. Shard the Test job (4-way matrix)

`matrix.shard: [1, 2, 3, 4]` × `jest --shard=K/N`. Each shard owns
~1/N of the suite by Jest's deterministic hash split — no per-DB-row
test fixture collides across shards. Each shard still runs
`--runInBand` inside its own process to preserve the "one DB per
worker" invariant. The architectural-guards + API-contract sub-steps
pin to shard 1 (`if: matrix.shard == 1`) so they execute exactly
once per CI run.

### 2. Shard the E2E job (3-way matrix)

`matrix.shard: [1, 2, 3]` × `playwright test --shard=K/3`.
Playwright's native shard contract is FILE-level — specs that share
seeded-tenant state stay on the same shard; `isolatedTenant` fixtures
are per-test, so cross-shard contamination is structurally impossible.
Each shard runs its OWN postgres service container, seed, build, and
`next start`. The a11y axe gate (`tests/e2e/a11y.spec.ts`) pins to
shard 1.

### 3. Summary jobs for stable branch-protection names

A new `test-summary` (named `Test`) and `e2e-summary` (named `E2E`)
aggregate their respective matrices via `needs.X.result`. Branch
protection's required checks keep stable names — a future
shard-count change touches only `matrix.shard` and `matrix.total`,
no admin update.

### 4. Skip Coverage on PR

Coverage gated to `push` to main + the weekly `schedule`
(`if: github.event_name == 'push' || github.event_name == 'schedule'`).
The Test matrix is the per-PR pass/fail gate; running Coverage on
every PR re-executes the same suite a second time for a duplicate
signal at the PR level. Coverage regressions only land via merge
anyway — main-push + nightly catch them within one merge.

### 5. `LARGE_RUNNER` repo variable

Heavy jobs (test shards, coverage, e2e shards, build, docker, trivy,
load-smoke) read `runs-on: ${{ vars.LARGE_RUNNER || 'ubuntu-latest' }}`.
On Team / Enterprise plans the operator sets `LARGE_RUNNER`
(Settings → Variables → Actions) to a configured GitHub-hosted
larger-runner label; unset → falls back to free 2-vCPU
`ubuntu-latest`. The workflow stays portable across plans + forks
(a hard-coded larger-runner label breaks contributor PRs from
external accounts).

Lint / Typecheck / Security / CodeQL stay on the small runner —
they're <3 min and don't benefit from more vCPUs.

### 6. Composite action for Node + Prisma setup

`.github/actions/setup-node-prisma/action.yml` deduplicates the
seven copies of `setup-node` + `npm ci` + `prisma generate` (with
the Roadmap-27 retry loop) that lived in every job. The
SIGILL-retry workaround now sits in ONE place — a future fix in
upstream Prisma can be removed here without touching seven copies.

## Expected speedup

| Job                | Before  | After (free) | After (4-vCPU `LARGE_RUNNER`) |
| ------------------ | ------: | -----------: | ----------------------------: |
| Test (critical)    | 30 min  | ~8 min       | ~4-5 min                      |
| E2E                | 17 min  | ~9 min       | ~5-6 min                      |
| Coverage per PR    | 33 min  | **skipped**  | **skipped**                   |
| Build              |  4 min  |  ~4 min      | ~2 min                        |

End-to-end PR wall-clock: **~33 min → ~9-10 min (free) → ~5-6 min
(with `LARGE_RUNNER`)**.

Trade-off note: runner-MINUTES go up (4 shards × the per-shard setup
overhead vs 1 job × setup) for the parallelism win. That's the right
trade for dev velocity. On Team plan with `LARGE_RUNNER` the
runner-minute cost increases ~2× vs the old shape, against a 6×
wall-clock improvement.

## Files

| File | Role |
| --- | --- |
| `.github/workflows/ci.yml` | matrix shards + summary jobs + Coverage event gate + `vars.LARGE_RUNNER` |
| `.github/actions/setup-node-prisma/action.yml` | composite action (Node + Prisma client) |
| `docs/implementation-notes/2026-06-12-ci-speedup.md` | this note |

## Decisions

- **Sharding via Jest/Playwright native `--shard`, not a custom file
  split.** Both are upstream-blessed and stable across versions.
  Custom splits drift the moment the test layout changes.
- **`--runInBand` kept inside each Jest shard.** The integration
  suite expects a single per-worker DB; lifting `--runInBand` would
  force a wider rewrite of the DB-setup helpers. Sharding gets
  parallelism cleanly from the matrix axis.
- **E2E shards rebuild + reseed independently.** Sharing artifacts
  between shards via `actions/upload-artifact` is possible but adds
  ~1 min download per shard plus cross-shard contamination risk on
  the seed file. Independent rebuilds are simpler and the time win
  still arrives.
- **Stable summary jobs.** Without `test-summary` + `e2e-summary`,
  branch protection has to enumerate `Test (shard 1/4)`, …, and a
  shard-count change requires an admin update. The summary jobs
  make the matrix an implementation detail.
- **`LARGE_RUNNER` is opt-in, not the default.** Workflows that
  hard-code a non-free runner label break on Free plans and on
  forks. The `vars.X || 'ubuntu-latest'` form keeps the workflow
  portable by construction.
- **Coverage on push, not PR.** The numeric-floor regression mode
  is "merged code lost coverage" — that ALWAYS flows through a main
  push. Catching it there is sufficient.
- **Composite action only for the Node+Prisma block.** The Postgres
  role + migrations setup also repeats but lives only in 4 jobs and
  shares an env block — extracting it would mean either (a) passing
  many inputs, dirtying the action surface, or (b) duplicating its
  env. Left untouched; revisit if a future job adds it for the 5th
  time.

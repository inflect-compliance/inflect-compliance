# 2026-06-12 — CI speedup: shard Test, skip Coverage on PR, larger-runner toggle

**Commit:** _(see PR — `ci: shard Test into 4 parallel jobs; skip Coverage on PR; LARGE_RUNNER toggle`)_

## Design

CI was the slowest part of the dev loop: per-PR wall-clock
~33–38 min before the first green check, dominated by **Test**
(30 min single-process `jest --runInBand`) and **Coverage**
(33 min same suite + instrumentation). Three structural moves cut
the critical path roughly 5×.

**Shard the Test job.** The matrix runs `jest --shard=K/N` across
4 parallel matrix jobs. Each shard owns ~1/N of the suite by Jest's
deterministic hash split — no per-DB-row test fixture collides
across shards. Each shard still runs `--runInBand` inside its own
process to preserve the "one DB per worker" invariant the suite
relies on. The architectural-guards + API-contract sub-steps stay
unsharded but pin to shard 1 (`if: matrix.shard == 1`) so they
execute exactly once per run.

A new `test-summary` job (named `Test`) aggregates the matrix
status via `needs.test.result`. Branch protection's required check
keeps the stable name "Test" without enumerating shards — a future
shard-count change touches only `matrix.shard` and `matrix.total`.

**Skip Coverage on PR.** Coverage is gated to `push` and `schedule`
events only (`if: github.event_name == 'push' || …`). The Test
matrix is the per-PR pass/fail gate; running Coverage on every PR
re-executes the same suite with instrumentation — a duplicate
signal at the PR level since coverage regressions only land via
merge anyway. Main-push + nightly catch them within one merge.

**`LARGE_RUNNER` repo variable.** Heavy jobs (test shards, coverage,
e2e, build, docker, trivy, load-smoke) read
`runs-on: ${{ vars.LARGE_RUNNER || 'ubuntu-latest' }}`. On Team /
Enterprise plans the operator sets `LARGE_RUNNER` (Settings →
Variables → Actions) to a configured GitHub-hosted larger-runner
label; unset → falls back to free 2-vCPU `ubuntu-latest`. The
workflow stays portable across plans.

Lint / Typecheck / Security / CodeQL stay on the small runner —
they're <3 min and don't benefit from more vCPUs.

## Expected speedup

| Job                | Before | After (free) | After (4-vCPU `LARGE_RUNNER`) |
| ------------------ | -----: | -----------: | ----------------------------: |
| Test (critical)    | 30 min |  ~8 min      | ~4-5 min                      |
| Coverage (per PR)  | 33 min |  **skipped** | **skipped**                   |
| Build              |  4 min |  ~4 min      | ~2 min                        |
| E2E                | 17 min |  ~17 min     | ~9-10 min                     |

End-to-end PR wall-clock: ~33 min → ~8-10 min (free) → ~5-6 min
(with `LARGE_RUNNER`).

## Files

| File | Role |
| --- | --- |
| `.github/workflows/ci.yml` | matrix shard + summary + `vars.LARGE_RUNNER` + Coverage event gate |

## Decisions

- **Sharding via Jest, not a custom file-list split.** `jest --shard`
  is the upstream-blessed contract and stable across Jest versions.
  A custom split keyed on file paths would drift the moment the
  test layout changes.
- **`--runInBand` kept inside each shard.** The integration suite
  expects a single per-worker DB; lifting `--runInBand` was tempting
  for parallelism but would force a wider rewrite of the DB-setup
  helpers. Sharding gets parallelism cleanly from the matrix axis.
- **A stable "Test" summary check.** Without the summary, branch
  protection requires enumerating `Test (shard 1/4)`, `Test (shard
  2/4)`, … — changing N would mean an admin update. The summary
  job makes the matrix an implementation detail.
- **Coverage on push, not PR.** The numeric floor regression mode
  is "merged code lost coverage" — that ALWAYS flows through a
  main push. Catching it there is sufficient; doubling-up on PRs
  was duplicating the same regression mode without catching new
  classes.
- **`LARGE_RUNNER` is opt-in, not the default.** Workflows that
  hard-code a non-free runner label break on Free plans and on
  forks (security audits, contributor PRs from external accounts).
  The `vars.X || 'ubuntu-latest'` form keeps the workflow portable
  by construction.

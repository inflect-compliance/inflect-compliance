> **Status: historical record (2026-07-10)** — a moment-in-time branch-fate
> analysis. The recommendation (retire `claude/implement-login-O64VA`) is for a
> human to action; this document is the evidence, not an executed change. The
> recurrence-prevention controls it motivated (branch-freshness CI guardrail +
> Prisma major pin) are authoritative and live — see
> [docs/prisma-upgrade-path.md](prisma-upgrade-path.md).

# Branch divergence — `claude/implement-login-O64VA` vs `main`

## TL;DR

**Recommendation: RETIRE the branch.** Every line of its product work is
already on `main` under different SHAs. It carries **no unique `src/` code**.
The four files that are unique to it are two docs, one coverage script, and one
test guardrail — none of which is product behaviour, and the guardrail is
superseded by `main`'s registry fix (#1537) plus the new runtime-wiring ratchet.
Rebasing it onto Prisma 7 would be pure conflict cost for zero unique value.

**Do not** merge the branch (wholesale or otherwise); **do not** auto-delete it
— this is a recommendation for a human to action.

## Premise correction

The task framed this as "~455 ahead / ~122 behind". The real divergence
(measured 2026-07-10):

```
git rev-list --left-right --count origin/main...origin/claude/implement-login-O64VA
2315    7
```

`main` is **2315 commits ahead**; the branch has **7 unique commits** (tip dated
2026-07-06). It is a small, stale feature branch — not a 455-commit parallel
line. That materially changes the fate analysis: there is no large body of
un-merged work to salvage.

## Framework-version skew

| Line | `prisma` / `@prisma/client` |
| --- | --- |
| `main` | `^7.8.0` (v1.756) |
| `claude/implement-login-O64VA` | `5.22.0` |

The branch predates the repo's Prisma 5→7 migration. Any rebase would have to
cross that major boundary — the single biggest reason not to revive it.

## The 7 commits, grouped by subsystem

| Commit | Subsystem | Fate on `main` |
| --- | --- | --- |
| `77f51923` populate provider registry at runtime | Integrations | **Superseded** — landed as #1537 (`081b6750`) |
| `a29d2fed` RQ4 foundations — page segregation + smart back | Navigation | **Superseded** — #1062 |
| `c6c7c9f9` RQ4-5/6/7/8 — BackAffordance on subpages | Navigation | **Superseded** — #1063 |
| `e51ee5f0` RQ4-9/10 — cohort sweep ratchet | Navigation | **Superseded** — #1064 |
| `7e28f607` perf(controls,tasks) — cut hydration refetch / over-fetch | Perf | **Superseded/moot** — those pages were heavily reworked on `main`; no unique `src/` remains |
| `1c654e1a` fix five pre-existing guardrails after EntityListPage | Test infra | **Moot** — those guardrails evolved independently on `main` |
| `19df30f4` test coverage roadmap + per-domain aggregator | Test tooling/docs | **Unique but non-product** (see below) |

## What is genuinely unique to the branch

The only files present on the branch and absent on `main`:

```
docs/implementation-notes/2026-07-06-integration-registry-runtime-wiring.md
docs/test-coverage-roadmap.md
scripts/coverage-by-domain.py
tests/guardrails/integration-bootstrap-runtime-wiring.test.ts
```

- The registry-runtime-wiring **impl note + guardrail** describe/lock the exact
  bug `main` already fixed in #1537. The guardrail is **superseded** by the new
  runtime-wiring ratchet added in the runtime-verification-conventions work
  (which supersets it: bootstrap-provider reachability + BullMQ scheduling).
- `docs/test-coverage-roadmap.md` + `scripts/coverage-by-domain.py` are an
  optional coverage-reporting aid. **Not product work.** If the team wants the
  per-domain coverage aggregator, it can be re-introduced as a one-file PR —
  it does not justify keeping a Prisma-5 branch alive.

**Net unique product code: none.**

## Recommendation

1. **Retire** `claude/implement-login-O64VA` (delete after a human confirms).
2. *(Optional, low priority)* If the per-domain coverage aggregator is wanted,
   cherry-pick `scripts/coverage-by-domain.py` + `docs/test-coverage-roadmap.md`
   as a standalone PR onto `main` — trivial, no Prisma coupling.
3. Nothing else to salvage.

## Recurrence prevention (shipped alongside this analysis)

- **Branch-freshness CI guardrail** — `.github/workflows/branch-freshness.yml`
  annotates any PR whose branch is more than `BEHIND_THRESHOLD` commits behind
  `main`, nudging a rebase before divergence compounds. Non-blocking by design.
- **Single Prisma major pinned** — `tests/guardrails/prisma-major-pin.test.ts`
  fails CI if `prisma` / `@prisma/client` drift off the pinned major or off each
  other. Upgrade path documented in
  [docs/prisma-upgrade-path.md](prisma-upgrade-path.md).

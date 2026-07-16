# 2026-07-16 — Minor-version cap: roll the major at the 999→1000 boundary

**Commit:** `<pending> chore(release): cap minor at 999, roll major at 1000`

## Design

semantic-release derives the next version purely from conventional-commit
types — the minor component is an unbounded integer, so a `feat`-heavy repo
climbs `1.998 → 1.999 → 1.1000 → 1.1001 …` indefinitely. `2.0.0` only ever
appears behind a genuine breaking change (`feat!` / `BREAKING CHANGE`).

Product decision: keep the minor to **three digits**. The release that would
become `1.1000.0` should roll over to `2.0.0` instead (odometer-style at the
century boundary). This recurs per major line: `2.999 → 3.0.0`.

Mechanism — a thin `analyzeCommits` wrapper plugin:

```
.releaserc.json
  analyzeCommits → ./scripts/semrel-minor-cap.mjs   (was @semantic-release/commit-analyzer)
      │  forwards { preset, releaseRules } verbatim
      ▼
  @semantic-release/commit-analyzer   → base type (patch|minor|major|null)
      │
      ▼
  capMinor(baseType, lastRelease.version)   (scripts/lib/minor-cap.mjs)
      → promotes `minor` to `major` iff lastMinor >= 999
```

The wrapper **replaces** the bare `commit-analyzer` entry rather than sitting
beside it. semantic-release max-merges the results of *all* `analyzeCommits`
plugins; keeping the wrapper as the sole provider (it calls commit-analyzer
internally) means there is one decision to reason about, not a two-plugin
merge. `@semantic-release/release-notes-generator` re-parses commits
independently, so removing commit-analyzer from the plugin *array* doesn't
affect note generation.

Only a `minor` bump is a promotion candidate: a `patch` never moves the minor
(`1.999.4 → 1.999.5` stays), and a `major` is already rolling. `999` itself is
allowed — the cap is on reaching **1000**.

## Files

| File | Role |
| --- | --- |
| `scripts/lib/minor-cap.mjs` | Pure, dependency-free `capMinor()` + `MINOR_CAP=999`. Testable in isolation. |
| `scripts/semrel-minor-cap.mjs` | `analyzeCommits` plugin: delegates to commit-analyzer, applies `capMinor`, logs a promotion. |
| `.releaserc.json` | `analyzeCommits` step routed through the wrapper (same preset/releaseRules forwarded). |
| `tests/unit/minor-cap.test.ts` | Decision-table + plugin-load tests, run through a Node ESM subprocess. |

## Decisions

- **The rollover major is COSMETIC** — no breaking change sits behind it. This
  is acceptable *only* because the app is `npmPublish: false`: nothing external
  consumes the semver contract; the version merely feeds the Helm `appVersion`
  (`scripts/sync-chart-version.mjs`) and the Docker image tags. A `_comment` in
  `.releaserc.json` + the module header record this so a future reader doesn't
  hunt for a non-existent break in the `2.0.0` CHANGELOG. A *real* breaking
  change still bumps the major the normal way, independent of the cap.
- **Split pure logic from the plugin.** `commit-analyzer` is ESM-only
  (`"type": "module"`); importing it inside jest's CJS world is brittle. Isolating
  the decision in a zero-dependency module lets the test exercise it through a
  subprocess (`node --input-type=module`) — the same pattern the repo already
  uses for `sync-chart-version.mjs`. The subprocess also imports the real plugin
  to prove the `commit-analyzer` import path resolves.
- **Fail open on a malformed `lastRelease.version`.** If the last version can't
  be parsed, `capMinor` returns the base type unchanged — a parse glitch must
  never manufacture a spurious `2.0.0`.
- **Cap value inlined as `MINOR_CAP = 999`** rather than an env var: it's a
  product constant, not per-environment config, and a test pins it.

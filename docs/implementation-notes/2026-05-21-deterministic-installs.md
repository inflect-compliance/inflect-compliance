# 2026-05-21 — Deterministic installs: `npm install` → `npm ci`

**Commit:** `<pending> chore(ci): strict deterministic installs — npm ci everywhere`

## Design

The `--legacy-peer-deps` flag was already gone from every install
path (removed by a prior change, locked by
`tests/guards/no-legacy-peer-deps.test.ts` + `docs/dependency-policy.md`).
But the *other* half of "strict, deterministic installs" was
unfinished: CI and the container build used `npm install` in every
install step.

`npm install` re-resolves semver ranges and may rewrite
`package-lock.json` mid-run, so two CI runs of the same commit are
not guaranteed identical — and a drifted lockfile is silently
"repaired" instead of surfaced. The remediation switches every
install path to `npm ci`: the `Dockerfile` deps stage + all nine CI
install steps (`ci.yml` ×8, `release.yml`, `load-test.yml`).
`npm ci` installs exactly the lockfile tree and hard-fails on a
lockfile out of sync with `package.json` — so it doubles as the
lockfile-integrity check in every job, with no separate CI step.

### Root cause `npm ci` surfaced

`npm ci` failed immediately on adoption — `EUSAGE`, the lockfile
missing all 8 `@next/swc-*` platform binaries. The cause: a stale
`optionalDependencies` block in `package.json` pinning all nine
`@next/swc-*` packages to the Next-14 version `14.2.35` (one was
half-updated to `16.2.6`; the block still listed
`@next/swc-win32-ia32-msvc`, which Next 16 dropped). The block was
bulk-added during the Next 14→16 migration by a vague "sync config
changes" commit and never corrected.

`@next/swc-*` are `next`'s own transitive optional dependencies —
npm installs them when it installs `next`. A consumer project must
never pin them. The stale block forced the Next-14 binaries at the
top level, conflicting with `next@16.2.6`'s own `16.2.6` SWC deps
(npm worked around it by nesting duplicate installs under
`node_modules/next/node_modules/`). `npm install` absorbed the
conflict silently; `npm ci` refused it.

Fix: delete the `optionalDependencies` block. `next` now resolves
its own platform binaries; the lockfile loses the stale block and
`npm ci` succeeds. Verified end-to-end — `next build` compiles with
native SWC, no wasm fallback.

A clean lockfile regeneration (`rm package-lock.json && npm
install`) was rejected: it drifted ~200 transitive packages — a
wholesale dependency bump, out of scope for an install-mechanics
fix.

### Node/npm version policy

Added `engines` (`node >=22 <23`, `npm >=10`) to `package.json` and
a `.nvmrc` (`22`). Node 22 was already the de-facto runtime (CI
`NODE_VERSION`, `node:22-alpine`) but undeclared; the policy is now
explicit and machine-checked across `.nvmrc` / `engines` / every
workflow `node-version`.

## Files

| File | Role |
|------|------|
| `package.json` | Removed the stale `@next/swc-*` `optionalDependencies` block; added `engines` (node + npm). |
| `package-lock.json` | Lost the stale root `optionalDependencies` block (the lockfile half of the same fix). |
| `.nvmrc` | NEW — pins Node 22 for version-manager users. |
| `Dockerfile` | `npm install` → `npm ci` in the deps stage. |
| `.github/workflows/ci.yml` | `npm install` → `npm ci` ×8 install steps. |
| `.github/workflows/release.yml` | `npm install` → `npm ci`. |
| `.github/workflows/load-test.yml` | `npm install` → `npm ci`; stale comment updated. |
| `tests/guards/deterministic-install.test.ts` | NEW — ratchet: install paths use `npm ci`, `engines` declared, Node version pinned consistently. |
| `docs/dependency-policy.md` | New "Deterministic installs" + reworked "Node / npm" sections. |
| `docs/plan-prisma-7-migration.md` | Dropped a stale `--legacy-peer-deps` from a historical command. |

## Decisions

- **Surgical lockfile fix, not regeneration.** Removing the stale
  block produces a 12-line `package-lock.json` diff with zero
  version drift. A full regen drifted ~200 packages — that is a
  dependency-bump PR, not an install-mechanics PR; the two concerns
  are kept separate.

- **`npm ci` IS the lockfile-integrity check.** No dedicated CI
  step is added — `npm ci` already hard-fails on a drifted lockfile
  in all nine jobs. A separate `npm ls` / dry-run step would be
  redundant.

- **`engines` is advisory, not `engine-strict`.** No `.npmrc`
  `engine-strict=true` — that would hard-block a contributor on
  Node 23/24 entirely. CI and the container image already pin Node
  22 exactly; `engines` + `.nvmrc` document and auto-select it
  without breaking local setups.

- **Two sibling ratchets, not one.** `no-legacy-peer-deps.test.ts`
  (strict peer resolution) and `deterministic-install.test.ts`
  (`npm ci` + version policy) are the two halves of a trustworthy
  install surface; kept as separate, single-purpose guards.

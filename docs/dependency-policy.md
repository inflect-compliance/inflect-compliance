# Dependency installation policy

> **New to the codebase?** Start at [CONTRIBUTING.md](../CONTRIBUTING.md) — the developer onboarding guide.

> Part of the dependency-governance model — see
> `docs/dependency-governance.md` for the four-pillar overview, the
> contributor lifecycle (adding / upgrading / removing a
> dependency), and the NextAuth stay-on-v4 policy. This document is
> the **install-time** layer: strict peers, `npm ci`, the
> `overrides` table, Node/npm pinning.

## Strict peer-dependency resolution

Installs are **strict**. No install path passes `--legacy-peer-deps`.
npm validates the peer-dependency graph on every `npm install` /
`npm ci`, so an incompatible package combination fails fast instead
of being silently absorbed.

`--legacy-peer-deps` used to be on every install step (`Dockerfile`,
all `.github/workflows/*`). It disabled peer validation wholesale —
which masked real incompatibilities. Removing it surfaced three
genuine conflicts left behind by the Next 14 -> 16 and React 18 ->
19 migrations; all three are now resolved (see below).

The ratchet `tests/guards/no-legacy-peer-deps.test.ts` fails CI if
the flag re-enters any install path.

## Resolved conflicts

| Conflict | Cause | Resolution |
|----------|-------|------------|
| `@visx/*@3.x` vs React 19 | visx 3.x (the latest stable line) peers `react ^16 \|\| ^17 \|\| ^18`; visx 4 — which adds React 19 — is alpha-only. The repo runs `react@19`. | `overrides` block: each `@visx/*` package's `react` / `react-dom` pinned to the root version (`$react` / `$react-dom`). visx 3.x is a set of stateless SVG renderers and runs correctly under React 19 — the override records that verified fact. |
| `eslint-config-next@16` vs `eslint@8` | The Next 16 upgrade bumped `eslint-config-next` to 16, which peers `eslint >=9`; `eslint` was left at 8 (now end-of-life). | `eslint` bumped to `^9`. The lint setup already uses flat config (`ESLINT_USE_FLAT_CONFIG=true`), so eslint 9 — where flat config is the default — is a natural fit. |
| `next-auth@4` vs `next@16` / `nodemailer@7` | `next-auth@4` peers `next ^12 \|\| ^13 \|\| ^14` and (optionally) `nodemailer ^6`. The repo runs `next@16` and `nodemailer@7`. | `overrides` block: `next-auth`'s `next` and `nodemailer` pinned to the root versions. NextAuth v4 is the supported stable line here; it operates correctly on next 16 / nodemailer 7. |

## The `overrides` block

`package.json` carries an `overrides` block that pins the peers
above to the real installed versions. This is deliberately
**granular** — it names exactly which peer mismatches are accepted,
and why (this document). It is the opposite of the blanket
`--legacy-peer-deps`: every *other* package's peers are still
validated strictly, so a new incompatible dependency is caught at
install time.

When a package in the table ships a release whose peer range
genuinely includes the version we run, drop its `overrides` entry —
the override is a bridge, not a destination.

## Security overrides

`overrides` also force a **patched transitive dependency** when an
advisory lands against a version pulled in by a package we don't
control. The CI `Security` job (`npm audit --omit=dev
--audit-level=moderate`) blocks merges on MODERATE+ advisories in
production deps, so an un-fixable transitive CVE would otherwise
wedge the whole pipeline.

| Override | Advisory | Why |
|----------|----------|-----|
| `uuid` → `^11.1.1` | GHSA-w5hq-g745-h8pq — missing buffer bounds check in uuid v3/v5/v6 when `buf` is provided (moderate) | `next-auth@4` declares `uuid@^8.3.2`; the whole `<11.1.1` line is vulnerable, so the only fix is forcing the patched major. `next-auth` uses the version-stable named `uuid` exports (`v4`, …), which are unchanged v8 → v11. Drop this entry if `next-auth` itself moves to a patched `uuid` range. |
| `sharp` → `0.35.3` | GHSA-f88m-g3jw-g9cj — sharp `<0.35.0` inherits libvips CVEs CVE-2026-33327 / 33328 / 35590 / 35591 (high) | `next@16.2.10` pulls `sharp@0.34.5` transitively for image optimisation; the whole `<0.35.0` line is vulnerable. `sharp` 0.35.x is a drop-in for Next's optimiser (same API surface), so force the patched `0.35.3`. Drop this entry once `next` itself depends on `sharp >=0.35.0`. |

A security override is NOT a bridge to drop on convenience — keep it
until the upstream package legitimately depends on a patched range.

## Deterministic installs — `npm ci`

Every install path — the `Dockerfile` and all CI workflows — runs
**`npm ci`**, never `npm install`:

| | `npm install` | `npm ci` |
|---|---|---|
| Lockfile | may be **mutated** (re-resolves semver ranges) | read-only; install fails if it drifts from `package.json` |
| Reproducibility | two runs of one commit can differ | identical tree every run |
| Corrupt lockfile | silently "repaired" | **surfaced** as a hard error |

`npm ci` is therefore both the install command AND the
lockfile-integrity check — there is no separate CI step for it. A
stale or hand-mangled `package-lock.json` fails fast in every job
instead of being papered over.

Enforced by `tests/guards/deterministic-install.test.ts`, which
fails CI if any install path reverts to `npm install`.

### A worked example — the `@next/swc-*` corruption

Adopting `npm ci` immediately surfaced a real defect that
`npm install` had been masking: a stale `optionalDependencies`
block in `package.json` pinned all nine `@next/swc-*` platform
binaries to the **Next 14** version `14.2.35` — a leftover from the
Next 14 → 16 migration, never updated. `@next/swc-*` are `next`'s
own transitive optional dependencies; a consumer project must never
pin them. The stale block conflicted with `next@16.2.6`'s own SWC
deps and corrupted the lockfile — exactly the kind of
incompatibility `npm install` absorbs silently. The fix: delete the
block — `next` resolves its own platform binaries.

`tests/guards/swc-version-coherence.test.ts` now makes the skew
unrepeatable: it fails CI if `package.json` pins any `@next/swc-*`
package directly, or if any `@next/swc-*` entry in the lockfile
carries a version other than the resolved `next` version. Re-add a
pin and the platforms desynchronise from `next` — the guard catches
it before merge.

## Node / npm

Node **22** across every environment, pinned in three places that
`deterministic-install.test.ts` keeps in agreement:

- **`.nvmrc`** (`22`) — `nvm` / `fnm` auto-select it.
- **`engines`** in `package.json` (`node >=22 <23`, `npm >=10`) —
  declares the supported runtime; npm warns on a mismatch.
- **CI / container** — `NODE_VERSION` in `ci.yml`, the literal
  `"22"` in `release.yml` / `deploy.yml` / `load-test.yml`, and the
  `node:22-alpine` base image in the `Dockerfile`.

npm ships with Node 22; no separate npm install step is required.

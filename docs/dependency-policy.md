# Dependency installation policy

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

## Node / npm

Node 22 across all environments (`Dockerfile`, CI `NODE_VERSION`,
local). npm ships with Node 22; no separate npm pin is required.

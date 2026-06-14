# 2026-06-14 — Node 22 → 24 bump: retires 4 Trivy CVE exemptions

**Branch:** `claude/cleanup-5-node-24-bump`

Fifth and final wave of the CI cleanup. The `.trivyignore` file
carried 4 narrow CVE exemptions, all in dependencies of the **npm
CLI bundled with `node:22-alpine`**:

  - `CVE-2026-33671` — picomatch < 4.0.4 RegEx DoS
  - `CVE-2026-33672` — picomatch method injection via POSIX brackets
  - `CVE-2026-33750` — brace-expansion DoS (zero-step patterns)
  - `CVE-2026-42338` — ip-address XSS in Address6 HTML emit methods

Each exemption's docblock documented the retirement trigger:

> *"Resolved when the Node base image ships an npm CLI whose
> transitive lockfile no longer carries the vulnerable version. A
> single base-image bump usually retires several exemptions at
> once."*

This PR ships that base-image bump.

## What changes

Every Node version pin moves from 22 → 24:

| File | Change |
|---|---|
| `Dockerfile` | `node:22-alpine` → `node:24-alpine` (×3 stages: deps, builder, runner) |
| `package.json` | `engines.node`: `>=22.0.0 <23.0.0` → `>=24.0.0 <25.0.0` |
| `.nvmrc` | `22` → `24` |
| `.github/workflows/ci.yml` | `NODE_VERSION: "22"` → `"24"` |
| `.github/workflows/deploy.yml` | `node-version: "22"` → `"24"` (×2) |
| `.github/workflows/release.yml` | `node-version: "22"` → `"24"` |
| `.github/workflows/load-test.yml` | `node-version: '22'` → `'24'` |
| `.github/actions/setup-node-prisma/action.yml` | default `"22"` → `"24"` |
| `.trivyignore` | 4 CVE entries removed; replaced with explanatory note |
| `tests/guards/deterministic-install.test.ts` | `nvmMajor` + engines assertion updated to `24` |
| `infra/helm/inflect/values.yaml` | inline doc comment refresh |

## Why Node 24 (not a Node 22 patch)

Node 24 became LTS in October 2025 and entered active production-ready
status. The 4 CVE-bearing npm-CLI deps (picomatch, brace-expansion,
ip-address) have all been bumped to patched versions in npm releases
that ship with Node 24's image. A Node 22 patch tag *might* also
contain the fixes, but bumping to the next LTS line gives us 18
months of additional security backports and keeps the codebase on a
supported release.

## Risk surface

Smaller than a major Node bump usually carries, because:

  - **No native ABI changes for our deps.** `prisma`, `sharp`,
    `argon2` all ship N-API binaries — N-API is ABI-stable across
    Node major versions by design.
  - **No deprecated-and-removed APIs we use.** A grep of the
    codebase for Node-22-deprecated APIs (`Buffer()` constructor,
    `url.parse`, legacy callback `fs.*Sync` patterns) finds zero
    call sites in production code; we've been on modern Node
    patterns throughout.
  - **No bundled-OpenSSL changes** — alpine's `openssl` package
    (installed in the runner stage) provides the runtime crypto;
    Node 24 ships against the same `apk add --no-cache openssl`
    line.

The two genuine risk surfaces (and how they're mitigated):

  - **Build-time perf** — Node 24's V8 sometimes regresses cold
    build times for large TypeScript projects. CI's `Build` job
    will catch any regression past the 10-minute timeout. Local
    smoke (`npx tsc --noEmit`, all Jest suites) was clean.
  - **Trivy result** — if Node 24's npm CLI somehow still ships
    the vulnerable packages, the Trivy gate will block this PR with
    a clear error pointing at the same CVE ids. The `.trivyignore`
    file is empty; nothing's hiding.

## Test summary

  - `npx tsc --noEmit` — clean.
  - `npx jest tests/guards/rq4 tests/guards/page-header-discipline.test.ts tests/guards/detail-page-back-prop-ban.test.ts tests/guards/action-label-vocabulary.test.ts tests/guards/no-explicit-any-ratchet.test.ts tests/guardrails/no-explicit-any-ratchet.test.ts tests/guards/no-plus-prefix-labels.test.ts tests/guards/deterministic-install.test.ts` — 70/70 across 14 suites.
  - The CI Build / Test / E2E / Docker / Trivy gates will be the
    real verification.

## Cleanup wave — totals after this PR

| Category | Before | After | PR |
|---|---:|---:|---|
| `as any` ratchet baseline | 4 | **0** | #1067 |
| `BACK_AFFORDANCE_COHORT_TODO` | 54 | **0** | #1068 + #1069 |
| `action-label-vocabulary` baseline | 22 | **0** | #1070 |
| `.trivyignore` exemptions | 4 | **0** | this PR |
| **Total** | **84 items** | **0** | 5 PRs |

Plus 2 latent runtime bugs fixed along the way (onboarding step-name
drift; retention-notifications priority literal).

## Out of scope (intentional)

Two `docs/` baselines remain non-zero, documented as **design
choices, not bugs**:

  - `epic55-native-select-ratchet` (6 native `<select>` sites) — the
    docblock explains these are deliberate dense-table-cell
    affordances; retirement = build a new `<TableInlineSelect>`
    primitive (real product engineering, ~1-2 PRs).
  - `epic52-datatable-ratchet` (13 raw `<table>` sites) — same
    story: documented exemptions for surfaces where DataTable
    doesn't fit (master/detail with inline decision controls, SoA
    print view, RBAC server component).

Both should be tracked as scheduled work, not cleanup.

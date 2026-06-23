# 2026-06-23 — E2E suite parallelization (isolated-tenant migration)

**Commit:** `<sha>` test(e2e): isolated-tenant migration + fullyParallel:true

## Design

The Playwright suite ran strictly serial (`fullyParallel: false`, `workers: 1`)
because mutating specs wrote to a SHARED seeded tenant (`DEFAULT_USER` /
`acme-corp`); two parallel mutators would corrupt each other's state. ~15 min
wall-clock in CI.

The fix flips the suite to `fullyParallel: true` + `workers: isCI ? 4 :
undefined`. That is safe only once every spec that WRITES is isolated. Each
mutating `test()` now provisions its own fresh, EMPTY tenant via the
`isolatedTenant` / `authedPage` fixtures (`tests/e2e/fixtures.ts`) — a write in
one test can never be observed by another. Read-only specs keep the shared
seed (concurrent reads can't corrupt). The end state is **two cohorts**:

- **Isolated cohort** (`import { test } from './fixtures'`): every mutating
  spec. Per-test tenant; fully parallel-safe.
- **Shared-seed cohort** (`import { test } from '@playwright/test'`):
  read-only, self-isolating, or serial-pinned additive mutators. Curated +
  reason'd in `tests/guards/e2e-isolation.test.ts::SHARED_SEED_ALLOWLIST`.

## Worker count

`workers: isCI ? 4 : undefined`. 4 matches the CI runner's usable vCPUs (the
large runner) and is the point past which the shared Postgres/Redis services
(single container each) become the bottleneck, not CPU. Locally `undefined`
lets Playwright pick (~half the cores) so a dev box isn't saturated. Each
worker drives its own browser; per-test isolated tenants keep DB rows from
colliding across workers. Expected CI wall-clock: ~15 min → ~5–6 min.

## Migration cohort

**Migrated to `isolatedTenant` (this PR):** epic54-crud-smoke,
entity-detail-layout, control-toggle-pills, risk-matrix-admin (test 1),
search-affordances, audit-readiness, reporting. (`controls-filter-epic53`
was initially migrated but reverted to the shared seed — see below: it's
read-only filter chrome whose FilterSelect palette only renders with
seeded rows, so the first parallel CI run failed it on the empty tenant.)
Already-isolated mixed specs (controls, control-edit-modal, issues) were left
as-is — their lone `loginAndGetTenant` call is the legitimate READER
role-gate test (the factory only mints OWNERs, so a READER can't be isolated;
it's read-only, so safe).

**Framework-install factory (new):** `createIsolatedTenant` yields an EMPTY
tenant with no installed frameworks, which previously blocked audit-readiness
+ reporting (they create audit cycles against installed frameworks). Added
`installFramework(page, tenantSlug, frameworkKey, packKey)` to `e2e-utils.ts`:
it POSTs `/api/t/:slug/frameworks/:frameworkKey` `{ packKey }` via the
signed-in `page.request` (carries the OWNER session). `Framework`/`FrameworkPack`
are a GLOBAL catalog (`key @unique`, no `tenantId`) seeded once, so
`installPack` creates tenant-scoped controls for a fresh tenant. Keys:
ISO27001 → `ISO27001_2022_BASE`, NIS2 → `NIS2_BASELINE`. (SOC2 has a framework
row but no installable pack — not needed by any migrated test.)

## Read-only carve-out

Read-only specs (list pages, a11y, theme, tooltips, responsive, filter chrome,
RBAC role-gates, the framework-catalog reads) keep `@playwright/test` + the
shared seed: they need the seed data and concurrent reads can't cascade. The
canonical rule lives in the `tests/e2e/fixtures.ts` docstring; the enforced
list is `SHARED_SEED_ALLOWLIST`.

## Decisions / trade-offs

- **Guard is allowlist-based, not mutating-verb-regex.** The guard
  (`tests/guards/e2e-isolation.test.ts`) fails CI if a spec imports the `test`
  runner from `@playwright/test` and is not in `SHARED_SEED_ALLOWLIST`. A new
  mutating spec defaults to `./fixtures`; using the shared seed is now an
  explicit, reviewed choice. A pure mutating-verb regex was rejected — it
  false-positives on read-only specs that click filter/tab buttons (e.g.
  admin-members opens the invite form but never submits it).
- **Two additive mutators stay on the shared seed, pinned `mode: 'serial'`:**
  `ai-risk-assessment` (applies AI suggestions → writes risks) and
  `ciso-portfolio` (creates a child tenant in the seeded org). Both were
  out-of-scope of the original migration list and need NEW factory infra to
  isolate — risk-seed + framework-install for the former, org-topology (org +
  ORG_ADMIN/AUDITOR + child-tenant create) for the latter. Serial-pinning stops
  their own tests from racing each other; cross-file they're additive and
  assert on their own entities. Full isolation is a tracked follow-up.
- **Verification is the CI parallel run.** The full browser suite needs a
  built app + Postgres + Redis + seed; local 3× runs aren't reproducible in
  the dev sandbox. Local gates: `npx playwright test --list` (whole suite
  parses), `tsc --noEmit`, and `npx jest tests/guards/e2e-isolation.test.ts`.
  The PR's now-parallel CI E2E job is the integration verification; if a
  residual shared-seed mutator flakes, the follow-up is to isolate it.

## Files

| File | Role |
|---|---|
| `playwright.config.ts` | `fullyParallel: true`, `workers: isCI ? 4 : undefined` |
| `tests/e2e/fixtures.ts` | (unchanged) `isolatedTenant` / `authedPage` fixtures |
| `tests/e2e/e2e-utils.ts` | + `installFramework` helper |
| `tests/e2e/{epic54-crud-smoke,controls-filter-epic53,entity-detail-layout,control-toggle-pills,risk-matrix-admin,search-affordances,audit-readiness,reporting}.spec.ts` | migrated to `isolatedTenant` |
| `tests/e2e/ai-risk-assessment.spec.ts` | pinned `mode: 'serial'` (shared-seed additive mutator) |
| `tests/guards/e2e-isolation.test.ts` | + `SHARED_SEED_ALLOWLIST` invariant + serial-pin assertion |

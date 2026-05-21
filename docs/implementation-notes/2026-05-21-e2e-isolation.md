# 2026-05-21 — E2E test isolation: fixture-scoped tenants, no shared describe state

**Commit:** `chore(e2e): real test isolation — fixture-scoped tenants, kill shared describe state`

## Design

The Playwright suite had two structural isolation defects:

1. **31 of 36 specs logged into the SAME seeded tenant** (`DEFAULT_USER
   = admin@acme.com` on `acme-corp`). A mutating spec's writes
   accumulated in that shared tenant; two mutating specs could pollute
   each other and create order-dependence.
2. **Several specs carried module-level `let` state across `test()`s** —
   a resource created in one `test()` was stored in a top-level `let`
   and read by a later `test()`. If the creating test failed, every
   later test in the file cascaded. Confirmed in `core-flow`,
   `invite-flow`, `reporting`, `controls`, `control-evidence`,
   `audit-readiness`, `policies`, plus implicit "find the first row"
   variants in `issues`, `vendors`, `control-tests`, `controls-enhanced`,
   `control-edit-modal`.

`playwright.config.ts` ran serial (`fullyParallel: false, workers: 1,
retries: 2`). Serial *masks* ordering bugs — it is not isolation. This
work replaces the masking with real structural isolation.

The architecture:

- **Read-only specs keep the shared seeded tenant.** List pages,
  filters, a11y, theme-toggle, tooltips, responsive, display checks —
  they navigate + assert, never write. They NEED the seed data (an
  isolated tenant is empty) and read-only access cannot cascade.
  Untouched.
- **Mutating specs move to a per-test isolated tenant.** A new
  Playwright fixture (`tests/e2e/fixtures.ts`) extends `test` via
  `base.test.extend` with:
    - `isolatedTenant` — test-scoped, calls the existing GAP-23
      `createIsolatedTenant()` factory → a fresh tenant + OWNER user
      provisioned through `/api/auth/register`, globally-unique slug,
      tracked in `.tenant-tracker.jsonl` and hard-deleted by
      `global-teardown.ts`.
    - `authedPage` — the standard `page`, already signed in as that
      OWNER on `/t/<slug>/dashboard`.
  Migrated specs `import { test, expect } from './fixtures'` and
  declare the fixture; they no longer hand-roll `createIsolatedTenant`
  in a `beforeEach`. `e2e-utils.ts`'s functions stay the underlying
  primitive — `fixtures.ts` is pure wiring on top.
- **Cross-test `let` cascades are eliminated.** Each test creates the
  resource it needs in its own body (via a small in-file `createX`
  helper) or, where a sequence of steps is genuinely one scenario,
  the N tests are collapsed into ONE `test()` with `test.step(...)`
  sub-steps — a step failure fails exactly that test, and there is no
  module-level state to leak.
- **A structural ratchet** (`tests/guards/e2e-isolation.test.ts`)
  scans every `tests/e2e/*.spec.ts` and fails CI if a top-level
  mutable binding is assigned inside one `test()` and read inside
  another. Carries an (empty) `BASELINE` with a "no stale entries"
  test, and in-file regression proofs.

Test-scoped (not worker-scoped) `isolatedTenant` is deliberate: a
worker-scoped tenant is shared by every test the worker runs, which
re-introduces the exact pollution this work removes. The cost is one
`/api/auth/register` round-trip per test (~1-2 s) — cheap insurance.

`fullyParallel` / `workers` are deliberately NOT flipped — that is a
separate perf change with its own flake surface. Real isolation
*unblocks* it; actually enabling parallelism is out of scope.

## Per-spec classification

| Spec | Class | Action |
|---|---|---|
| `controls` | mutating | migrated → `isolatedTenant`; reader test kept on seed |
| `control-evidence` | mutating | migrated; `controlDetailPath` `let` cascade removed |
| `core-flow` | mutating | migrated; 6 tests → 1 `test()` with `test.step` |
| `invite-flow` | mutating | migrated; 4 tests → 1 scenario, garbage-token test independent |
| `reporting` | mixed | A/B/D read-only kept; E-G cascade → 1 `test()` with steps (seed — needs frameworks) |
| `audit-readiness` | mixed | each flow's cascade → 1 `test()` with steps (seed — needs frameworks) |
| `issues` | mutating | migrated; reader test kept on seed |
| `vendors` | mutating | migrated; "first row" implicit cascade removed |
| `control-tests` | mutating | migrated; 4-test cascade → 1 `test()` with steps |
| `controls-enhanced` | mutating | migrated; "first control" dependence removed |
| `new-risk-modal` | mutating | migrated |
| `create-control-modal` | mutating | migrated |
| `evidence-upload-modal` | mutating | migrated |
| `control-edit-modal` | mutating | migrated; reader test kept on seed |
| `policies` | mutating | migrated; `createdPolicyPath` `let` cascade removed |
| `frameworks` | read-only* | unchanged — already on `createIsolatedTenant` |
| `onboarding`, `responsive`, `theme-toggle`, `e2e-utils-isolation` | — | unchanged — already isolated |
| `ciso-portfolio` | mutating | kept on seed — needs the seeded `acme-org` Organization hierarchy, which the factory does not create |
| `ai-risk-assessment` | mutating | kept on seed — generates against seeded frameworks; factory tenant has none |
| `a11y`, `admin-members`, `admin-regression`, `admin-sso`, `auth`, `controls-filter-epic53`, `control-toggle-pills`, `credentials-hardening`, `data-table-platform`, `epic54-crud-smoke`, `filters`, `rbac-access`, `risk-matrix-admin`, `tooltip-and-copy` | read-only | unchanged — kept on shared seed |

\* `frameworks` carries a documented carve-out: it needs the seed's
installed frameworks, so its `createIsolatedTenant` use is for the
auth user only; it is already on the factory.

The three specs left on the seed tenant DESPITE mutating
(`ciso-portfolio`, `ai-risk-assessment`, and the framework-dependent
parts of `reporting` / `audit-readiness`) all need seed data the
factory cannot reproduce — a seeded Organization hierarchy, or
installed frameworks. Migrating them is gated on the factory gaining
an `installFrameworks` / org-bootstrap option. Their cross-test `let`
cascades were still fixed (collapsed into `test.step` scenarios).

## Files

| File | Role |
|---|---|
| `tests/e2e/fixtures.ts` | NEW — `test` extended with `isolatedTenant` + `authedPage` fixtures |
| `tests/guards/e2e-isolation.test.ts` | NEW — structural ratchet banning cross-test `let` cascades |
| `tests/e2e/controls.spec.ts` | migrated to fixture; per-test control creation |
| `tests/e2e/control-evidence.spec.ts` | migrated; `controlDetailPath` cascade removed |
| `tests/e2e/core-flow.spec.ts` | one `test()` with `test.step` A-F on an isolated tenant |
| `tests/e2e/invite-flow.spec.ts` | one `test()` scenario; OWNER is the isolated tenant's owner |
| `tests/e2e/reporting.spec.ts` | A/B/D independent read-only; E-G one scenario |
| `tests/e2e/audit-readiness.spec.ts` | each flow → one `test()` with `test.step` |
| `tests/e2e/issues.spec.ts` | migrated; `createIssue` helper; reader test on seed |
| `tests/e2e/vendors.spec.ts` | migrated; `createVendor` helper |
| `tests/e2e/control-tests.spec.ts` | one `test()` scenario; rollup check separate |
| `tests/e2e/controls-enhanced.spec.ts` | migrated; `createControl` helper |
| `tests/e2e/new-risk-modal.spec.ts` | migrated to fixture |
| `tests/e2e/create-control-modal.spec.ts` | migrated to fixture |
| `tests/e2e/evidence-upload-modal.spec.ts` | migrated to fixture |
| `tests/e2e/control-edit-modal.spec.ts` | migrated; reader test on seed |
| `tests/e2e/policies.spec.ts` | migrated; `createPolicy` helper; `createdPolicyPath` cascade removed |
| `CLAUDE.md` | E2E testing convention rewritten — shared-seed vs isolated-fixture decision tree |

## Decisions

- **Read-only specs deliberately stay on the shared seed.** An
  isolated tenant is empty; a list-page / a11y / filter test that
  asserts against seed rows would fail on an empty tenant. Read-only
  access cannot cascade, so there is no isolation benefit to
  migrating them — only added cost and a new way to break them.
- **`test.step` over N-tests-sharing-a-`let`** for true scenarios.
  `core-flow` A-F, `invite-flow`, `reporting` E-G, `audit-readiness`
  flows, `control-tests` are inherently sequential — step C depends
  on step B's resource. Splitting them into N `test()`s never gave
  isolation (the shared `let` was the cascade); it only multiplied
  the failure surface. One `test()` with `test.step(...)` keeps the
  readable per-step breakdown in the report, fails as a single unit,
  and has zero module-level state.
- **Test-scoped `isolatedTenant`, not worker-scoped.** Worker-scoped
  would share one tenant across every test the worker runs — the
  exact pollution being removed. The per-test register round-trip is
  the price of genuine isolation.
- **Reader-permission tests stay on the seed tenant.** The factory
  only ever provisions an OWNER. Tests that assert a READER
  (`viewer@acme.com`) sees no create CTAs (`controls`, `issues`,
  `control-edit-modal`) keep `loginAndGetTenant(page, READER_USER)` —
  they only navigate + assert, so they cannot pollute the shared
  tenant.
- **`fullyParallel` left OFF.** Real isolation is the precondition
  for parallelism, but enabling `fullyParallel: true` / `workers > 1`
  is a separate change with its own flake risk (shared `next start`
  server contention, DB connection pressure). It is now *unblocked* —
  flipping it is a follow-up perf PR.
- **The ratchet scans `test()` bodies only.** A top-level `let`
  assigned in `beforeEach` / `beforeAll` is the correct shared-setup
  pattern (`audit-readiness`'s `let page`), not a cascade. The
  detector brace-matches `test(...)` / `test.only(...)` callback
  bodies and excludes `describe` / `beforeEach` / `beforeAll` /
  `test.step`. It strips comments + string/template literals before
  the identifier scan so it never trips on text.

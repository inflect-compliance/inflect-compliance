# Test coverage policy

This document is the coverage **policy** for a compliance SaaS — why
the bar is what it is, per layer, and how it ratchets up over time.
The enforced numbers live in `jest.thresholds.json`; this doc is the
reasoning behind them.

## Coverage is a risk control, not a vanity metric

Coverage percentage is only a proxy. What matters for a compliance
platform is whether the **decision logic** that enforces business
rules, permissions, and state transitions is actually exercised.

Two consequences shape this policy:

1. **Branch coverage outranks line coverage.** A usecase with eight
   `if`s can hit 100% *lines* from a single happy-path test that
   never takes a single `else`. The untested branch is the one that
   wrongly grants access, skips a validation, or mishandles an
   invalid state transition. For decision-heavy code, the branch
   number is the real signal — line coverage is the floor, not the
   goal.

2. **Layers carry different risk, so they carry different bars.**
   A bug in the business-logic layer is a compliance defect shipped
   to customers. A bug in a thin HTTP route handler is usually a
   400 vs 500. The policy is risk-tiered accordingly.

## Risk tiers

| Tier | Scope | Why | End-state target (branches / functions / lines) |
|------|-------|-----|--------------------------------------------------|
| **A — Highest assurance** | `src/app-layer/usecases/` | The business-logic layer **is the product** — business rules, approvals, workflow transitions, validations, enforcement. An untested branch here is a shipped compliance defect. | **70 / 70 / 80** |
| **A — Highest assurance** | `src/app-layer/policies/` | Authorization decisions (`assertCanRead/Write/Admin/Audit`). A wrong branch is a security hole. Branch-dense and small — a high bar is cheap to hold. | **75 / 75 / 80** |
| **B — High assurance** | `src/lib/` | Cross-cutting shared code — auth/session, crypto, rate-limit, parsing, config. A bug here ripples app-wide. | **65 / 65 / 75** |
| **B — High assurance** | `src/app-layer/events/` | The hash-chained audit trail — integrity-critical. | **65 / 65 / 75** |
| **C — Standard** | Global (everything else) | API route handlers are thin HTTP glue; React components are UI. Real, but a 500 not a compliance breach. | **65 / 65 / 78** |

`policies/` and `events/` got their dedicated threshold keys in
**quality-roadmap P3** — seeded a few points below measured coverage
so the existing assurance is locked while leaving margin for
single-test flake. Roadmap-3 P4 originally reserved this slot; it was
filled by quality-roadmap P3.

## Current floors vs. targets

`jest.thresholds.json` holds the **current floor** — the highest
value CI can enforce today without failing. It is a ratchet: never
lowered, raised whenever a PR earns it.

| Scope | Branches now → target | Functions now → target | Lines now → target |
|-------|----------------------|------------------------|--------------------|
| `usecases/` | **55** → **70** | **49** → **70** | **65** → **80** |
| `policies/` | **78** → 75† | **88** → 75 | **88** → 80 |
| `events/` | **72** → 65† | **60** → 65 | **78** → 75 |
| `lib/` | **66** → 65 | **61** → 65 | **71** → 75 |
| global | **56** → 65 | **54** → 65 | **70** → 78 |

†`policies/` and `events/` already SURPASS their tier targets on
branches — the tier target stays as written for parity with the
other dimensions; the ratchet enforces the higher measured floor.

`usecases/` remains the headline gap, but the picture is much less
dire than the original "sub-50% branches" framing: measured branch
coverage is **≈58%**, with the floor at 55 holding it. The remaining
work is the climb from 55 to 70 across the next stages.

## The staged ratchet plan

One giant threshold jump is not adoptable — it would block every PR
until a massive test backlog clears. Coverage rises in deliberate
stages, each a PR that adds real tests and then lifts the floor in
the same diff so the gain is locked.

`usecases/` branch coverage — the priority metric:

| Stage | Branch floor | Status | How |
|-------|-------------|--------|-----|
| 0 | 37 | ✅ done | starting point |
| 1 | ≈50 | ✅ done — Roadmap-3 P2 (#623 floor 37→42) + accumulated drift | |
| 2 | **55** | ✅ done — quality-roadmap P1/P2 (lock the gain; measured ≈58) | |
| 3a | **56** | ✅ done — auth-followups quality wave: 3 previously-untested usecase files (`evidence-maintenance`, `control/templates`, `audit-readiness/sharing`) got 51 branch-focused tests across ~50 decision paths. Floor bumped +1 across all 4 metrics in the same diff. | |
| 3b | **58** | ✅ done — stage-3b wave: 41 branch-focused tests on `audit-readiness/packs.ts` (443 lines, previously untested) covering ~30 decision branches across 8 exported functions + 4 snapshot helpers + 2 default-pack pickers. File-level coverage **92/85/89/95**. Floor bumped +2 across all 4 metrics in the same diff. | |
| 3c | **60** | ✅ done — stage-3c wave: `framework/install.ts` already had a 15-test wave-4 unit test, but it covered only **35.48%** of branches (5 of 7 functions, with gaps). Extended to 39 tests covering `computeCoverage` + `listTemplates` (previously untested) + the missing branches across the prior 5 functions. File-level jumped **45/35/47/44 → 97/95/93/97** — a 60-point branches lift on 544 lines. Floor bumped +2 across all 4 metrics. | |
| 3d | **≈63** | next | `org-invites.ts` (512 lines, genuinely untested) — compliance-critical: one of only 3 paths that can write `TenantMembership`. Branches cover token issuance, revoke, expiry, atomic redeem with email-mismatch burn, last-OWNER edges. |
| 3e | **≈66** | — | `webhook-processor.ts` (485 lines) — signature verification + payload dispatch + idempotency |
| 3f | **≈68** | — | `control/queries.ts` (337) + `framework/coverage.ts` (313) — coverage + readiness reports |
| 3g | **≈70** | — | Long-tail medium files (`org-dashboard-{widgets,presets}`, `framework/fixtures`, `org-tenants`, `soft-delete-lifecycle`, `vendor-assessment-reminder`, `control/page-data`, `test-readiness`) |
| 4 (target) | **70** | — | end state; held by the ratchet (overlaps stage 3g — the floor lands at 70 once 3g's measured supports it) |

`lib/` is already at its tier target (66/61/71). Global rises as a
*consequence* of A/B-tier gains plus standard-tier hygiene — it is
not chased directly.

Two rules keep the ratchet honest, both already CI-enforced via
`jest.config.js` + the `Coverage (≥60%)` job:

- **A PR may not lower a floor.** If a change drops observed
  coverage below a floor, CI fails — add the missing test or revert.
- **A PR that raises observed coverage raises the floor**, in the
  same diff, so the gain cannot silently erode later.

Roadmap-3 P4 makes the "never lower a floor" rule a structural
guardrail (a ratchet test), rather than relying on contributor
discipline.

## What NOT to do

- **Do not chase line coverage with assertion-free tests.** A test
  that calls a function and asserts nothing lifts the line number
  and protects nothing. Branch + behavioural assertions or it does
  not count.
- **Do not add a threshold key above measured coverage.** It fails
  CI immediately. Seed a new key at the measured value, then
  ratchet.
- **Do not lower a floor to make a red PR green.** That is the
  regression this policy exists to prevent — fix the test gap.

## Enforcement

- **Source of truth:** `jest.thresholds.json` (global + per-folder
  keys), passed to jest via `--coverageThreshold` on the CI
  `Coverage (≥60%)` job. The CLI flag is load-bearing — jest 29
  ignores config-level `coverageThreshold` when `projects:` is set
  (see `docs/implementation-notes/2026-04-27-gap-15-coverage-enforcement.md`).
- **Per-layer keys** in that file enforce a higher bar on the
  higher-risk folders independently of the global number.
- The CI job prints the observed-vs-floor table on every PR.

### The ratchet guard

`tests/guards/coverage-ratchet.test.ts` makes the **"never lower a
floor"** rule structural, not just a convention. It carries a
`RATCHET_FLOOR` — the hard minimum for every threshold — and fails
CI if any value in `jest.thresholds.json` drops below it.

- **Raising** a threshold always passes (a value above the floor is
  fine) — that is the ratchet moving up.
- **Lowering** one below the floor fails CI loudly. To genuinely
  retire a floor you must edit `RATCHET_FLOOR` downward too — a
  visible, reviewed act, never a drive-by "make CI green" change.
- `RATCHET_FLOOR` is seeded at the post-Roadmap-3 state and is only
  ever edited upward as the staged plan advances.

This is the structural backstop for the policy: the
`Coverage (≥60%)` job enforces the *current* numbers; the ratchet
guard enforces that those numbers can only travel one direction.

### Next ratchet steps

- ~~Add dedicated threshold keys for `policies/` and `events/`.~~
  ✅ done in quality-roadmap P3 — keys seeded at the measured values
  (`policies/` 78/88/88/85, `events/` 72/60/78/75) and added to
  `RATCHET_FLOOR`.
- Advance the `usecases/` branch floor through the remaining stages:
  **stage 3 (≈65)** next — branch tests for the lowest-covered
  files (`audit-readiness/packs`, `framework/*`, `control/*`,
  `evidence-maintenance`, …), each currently at 0% branch
  coverage despite carrying substantial business logic — then
  **stage 4 (70)** as the end state held by the ratchet.

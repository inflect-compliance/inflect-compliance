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

`policies/` and `events/` do not have dedicated threshold keys
**yet** — a new key must be seeded at or below *measured* coverage
or it fails CI on the next run (see `jest.config.js`). Roadmap-3 P4
adds those keys once their coverage is measured and lockable.

## Current floors vs. targets

`jest.thresholds.json` holds the **current floor** — the highest
value CI can enforce today without failing. It is a ratchet: never
lowered, raised whenever a PR earns it.

| Scope | Branches now → target | Functions now → target | Lines now → target |
|-------|----------------------|------------------------|--------------------|
| `usecases/` | 37 → **70** | 30 → **70** | 49 → **80** |
| `lib/` | 48 → **65** | 48 → **65** | 57 → **75** |
| global | 56 → **65** | 54 → **65** | 70 → **78** |

The gap in `usecases/` is the headline risk: **sub-50% branch
coverage in the layer that *is* the product.** Roughly two in three
business decision paths are unexercised.

## The staged ratchet plan

One giant threshold jump is not adoptable — it would block every PR
until a massive test backlog clears. Coverage rises in deliberate
stages, each a PR that adds real tests and then lifts the floor in
the same diff so the gain is locked.

`usecases/` branch coverage — the priority metric:

| Stage | Branch floor | How |
|-------|-------------|-----|
| 0 (today) | 37 | — |
| 1 | **≈50** | Roadmap-3 P2 — branch tests for the highest-risk usecases |
| 2 | **≈58** | follow-up usecase test sweeps |
| 3 | **≈65** | continued, plus new usecases land test-complete |
| 4 (target) | **70** | end state; held by the ratchet |

`lib/` follows the same shape (48 → ≈56 → ≈62 → 65), driven by
Roadmap-3 P3. Global rises as a *consequence* of A/B-tier gains
plus standard-tier hygiene — it is not chased directly.

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

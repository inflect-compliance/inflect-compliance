# 2026-05-21 — Risk-tiered test-coverage policy

**Commit:** `<pending> docs(coverage): risk-tiered coverage policy + staged ratchet plan`

## Design

The first prompt of the test-quality roadmap. The repo already had
the *mechanism* for graduated coverage — `jest.thresholds.json` with
per-folder keys, enforced via the `--coverageThreshold` CLI flag on
the CI `Coverage (≥60%)` job (GAP-15). What it lacked was a
**policy**: a documented, risk-tiered rationale for *what* the bar
should be per layer and *how* it gets there.

`docs/coverage-policy.md` supplies that:

- **Coverage as a risk control.** Branch coverage outranks line
  coverage — for decision-heavy compliance logic the untested
  branch is the one that wrongly grants access or skips a
  validation. Line coverage is the floor, not the goal.
- **Risk tiers.** Tier A (highest assurance) = `usecases/` (the
  business-logic layer — the product) and `policies/` (authorization
  decisions). Tier B = `lib/` and `events/` (cross-cutting / audit
  integrity). Tier C = global (thin route handlers, UI components).
  Each tier has an explicit end-state target.
- **The gap.** `usecases/` sits at 37% branch coverage — sub-50% in
  the layer that *is* the product. That is the headline risk this
  roadmap exists to close.
- **A staged ratchet**, not one jump: `usecases/` branches
  37 → ≈50 → ≈58 → ≈65 → 70, each stage a PR that adds real tests
  and lifts the floor in the same diff.

This is a policy/docs change. The threshold *values* in
`jest.thresholds.json` are unchanged — they are the current floor
and can only rise as the test work in Roadmap-3 P2 (`usecases/`)
and P3 (`lib/`) earns it. P4 makes "never lower a floor" a
structural guardrail.

## Files

| File | Role |
|------|------|
| `docs/coverage-policy.md` | NEW — the risk-tiered policy: tiers, end-state targets, the staged ratchet plan, the why. |
| `jest.config.js` | Coverage-ratchet comment now points at the policy doc. |
| `docs/implementation-notes/2026-05-21-coverage-policy.md` | NEW — this note. |

## Decisions

- **Policy doc, not threshold raises.** A coverage floor cannot be
  raised above *measured* coverage without failing CI. P1 therefore
  designs the model and the plan; P2/P3 do the test work that earns
  each raise. Separating policy from execution keeps each PR
  honest — a raised floor always ships with the tests that justify
  it.

- **`policies/` joins `usecases/` in Tier A.** Authorization is as
  compliance-critical as business logic and is branch-dense — a
  wrong branch is a security hole. It does not get a dedicated
  threshold key yet: a new key must be seeded at or below measured
  coverage, so P4 adds it once coverage is measured.

- **Global is not chased directly.** `src/lib/**` legitimately
  includes one-shot scripts and CLI entry points shipped without
  unit tests. The durable lever is per-layer tightening on the
  high-risk folders; the global number rises as a consequence.

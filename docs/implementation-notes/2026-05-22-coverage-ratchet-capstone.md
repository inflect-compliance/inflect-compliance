# 2026-05-22 — Coverage ratchet capstone

**Commit:** `<pending> test(guards): coverage ratchet — thresholds are one-way-up`

## Design

The final item of the test-quality roadmap. The first three
remediations:

- **P1** — `docs/coverage-policy.md`: the risk-tiered coverage
  policy + the staged ratchet plan.
- **P2** — `usecases/` branch-coverage uplift (37 → 42 floor).
- **P3** — `lib/` branch-coverage uplift (48 → 66 floor).

The gap they leave: the "never lower a floor" rule lived only as
prose in `jest.config.js` and `docs/coverage-policy.md`. A PR could
still lower a `jest.thresholds.json` value to turn a red Coverage
job green — the exact GAP-02 regression — and nothing structural
would catch it.

`tests/guards/coverage-ratchet.test.ts` closes that. It carries a
`RATCHET_FLOOR` — the hard minimum for every threshold, seeded at
the post-Roadmap-3 state — and fails CI if any value in
`jest.thresholds.json` drops below it. Raising a threshold always
passes (the ratchet moving up); lowering one below the floor fails
loudly. To genuinely retire a floor, `RATCHET_FLOOR` must be edited
downward in the same diff — a visible, reviewed act.

Two layers now protect coverage:
- the CI `Coverage (≥60%)` job enforces the *current* numbers;
- the ratchet guard enforces that those numbers can only travel
  one direction — up.

### Why this is the realistic "forced upward"

CI cannot fail a PR for "didn't improve coverage" without blocking
unrelated work. So coverage is not *forced* up by the guard — it is
*ratcheted*: the staged plan in `docs/coverage-policy.md` drives the
rises, and this guard locks every gain so it cannot erode. That is
the adoptable shape the policy asked for.

`policies/` and `events/` dedicated threshold keys are deliberately
left as the documented next ratchet step — a fresh key must be
seeded at measured coverage, which is its own small, careful change.

## Files

| File | Role |
|------|------|
| `tests/guards/coverage-ratchet.test.ts` | NEW — fails CI if any `jest.thresholds.json` value drops below the `RATCHET_FLOOR`. |
| `docs/coverage-policy.md` | "Enforcement" section gains the ratchet-guard subsection + the next-steps list. |

## Decisions

- **A floor, not a mirror.** `RATCHET_FLOOR` is the hard minimum,
  not a copy of `jest.thresholds.json` that must be kept in lockstep.
  A PR that raises a threshold need not touch the guard — only a PR
  that *lowers* one toward/below the floor interacts with it. This
  keeps the common case (raising) friction-free.

- **No meta-ratchet.** Roadmap-1 and Roadmap-2 capstones produced
  "guard the guards" meta-ratchets because they protected multiple
  domain guardrails. Roadmap-3's capstone IS a single ratchet guard
  — wrapping one guardrail in a one-entry meta-ratchet would be
  ceremony. If the guard is deleted, the `Coverage` CI job still
  enforces the live thresholds; only the never-lower protection is
  lost.

- **`policies/` / `events/` keys deferred.** Seeding a new
  per-folder key above measured coverage fails CI immediately; it
  must be measured first. Per the policy doc's own staging, that is
  the next ratchet step, not part of this enforcement capstone.

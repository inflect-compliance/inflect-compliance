# 2026-05-22 — Verification-policy capstone

**Commit:** `<pending> test(guards): verification-policy + integrity meta-ratchet`

## Design

The final item of the frontend/verification roadmap. The first three
remediations:

- **P1** — `docs/frontend-assurance-model.md` + behavioural rendered
  tests + `behavioural-coverage-registry.test.ts` (high-risk UI
  primitives must have a rendered test).
- **P2** — `sanitize-rich-text-coverage.test.ts` rebuilt as
  structural completeness over the `ENCRYPTED_FIELDS` registry.
- **P3** — `docs/test-portfolio.md` + functional tests for
  behaviour-heavy modules that were at 0%.

Each pillar shipped its own artefact. The capstone does two things:

### 1. The unified verification policy

`docs/verification-policy.md` names three non-interchangeable
verification states and the rule that binds them:

- **Structurally present** — a structural ratchet passes; says
  nothing about behaviour.
- **Functionally tested** — the behaviour is exercised (computed /
  rendered outcome, branches, errors). The minimum bar for "done".
- **Browser verified** — the full flow works in a real browser.

It states plainly that a green structural ratchet is not a
completion claim — the "ratchet green but feature broken" failure
mode the audit named — and is the umbrella over the four pillars,
each mapped to its doc + guardrail.

### 2. The meta-ratchet

`tests/guards/verification-integrity.test.ts` carries a registry of
the two verification guardrails (`behavioural-coverage-registry`,
`sanitize-rich-text-coverage`) and fails CI if either is deleted or
gutted to a no-op (file exists, keeps its subject anchors, >= 3
`it`-blocks). It also asserts the verification docs + the
portfolio diagnostic survive, and that the policy doc still states
the structural-is-not-verified rule. It is the frontend/verification
sibling of `ci-pipeline-integrity.test.ts` and
`observability-reliability-integrity.test.ts`.

### Preventing silent accumulation

The audit's named failure — unverified items piling up while CI
stays green — is now structurally blocked: a new high-risk UI
primitive needs a rendered test (P1's registry), a new rich-text
field must be classified (P2), a new behaviour-heavy module is held
by the coverage ratchet, and the guardrails themselves cannot be
quietly removed (this meta-ratchet). The verification policy doc
makes the bar explicit so it does not depend on reviewer memory.

## Files

| File | Role |
|------|------|
| `docs/verification-policy.md` | NEW — the unified verification policy: three states, the rule, the four pillars. |
| `tests/guards/verification-integrity.test.ts` | NEW — the meta-ratchet guarding the verification guardrails + docs. |

## Decisions

- **A policy doc + a meta-ratchet, not new enforcement.** P1's
  `behavioural-coverage-registry` and P2's structural sanitiser
  guardrail ARE the enforcement against silent accumulation. The
  capstone makes the policy explicit and locks those guardrails —
  re-implementing enforcement would be duplication.

- **A separate meta-ratchet, per domain.** Roadmap-1's
  `ci-pipeline-integrity`, Roadmap-2's
  `observability-reliability-integrity`, and this
  `verification-integrity` each guard their own domain's guardrails.
  Three domain capstones, each name honest to its scope.

- **No back-fill of the ~100 historical `Status: ?` items.** The
  audit's backlog is real but the capstone's job is to stop *new*
  unverified items accumulating, not to retro-verify the past in one
  sweep — the policy doc and the registries drive that down over
  time, as P1's audit itself recommended ("convert one ratchet per
  session").

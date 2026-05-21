# 2026-05-21 — CI/CD pipeline-integrity capstone

**Commit:** `<pending> ci(guards): pipeline-integrity meta-ratchet + build/env-validation discipline`

## Design

The final item of the four-prompt CI/CD reliability roadmap. The
first three remediations each landed with their own structural
guardrail:

- **P1 — dependency-install integrity:** `no-legacy-peer-deps.test.ts`
  + `deterministic-install.test.ts`.
- **P2 — E2E test isolation:** `e2e-isolation.test.ts`.
- **P3 — staging smoke gate:** `deploy-staging-gate.test.ts` +
  `deploy-workflow.test.ts`.

So the capstone is NOT re-doing those guardrails. Its two jobs:

### 1. Build / env-validation discipline (the 4th, lower-risk item)

The CI **Build** job runs `npx next build` with env validation
skipped (`SKIP_ENV_VALIDATION: "1"` at the workflow level →
`src/env.ts` skips its zod check). Skipping is *correct* — CI has
only dummy secrets — but it was implicit. A reader could mistake a
green Build for an env-config pass.

Made explicit: the Build step now carries a comment stating the
skip is deliberate and naming the real gate — RUNTIME, not build
time (`src/env.ts` validates on process start when the flag is
unset; `src/instrumentation.ts` runs the GAP-03 fail-fast startup
checks). No behaviour change; the change is the documentation +
the lock.

### 2. The meta-ratchet — guarding the guards

`tests/guards/ci-pipeline-integrity.test.ts` carries a registry of
the five pipeline guardrails and fails CI if any is **deleted** or
**gutted to a no-op** — the file must exist, still contain its
subject anchors, and carry ≥ 3 `it`-blocks. It also locks the
build/env posture (item 1).

"Make the safe path the default path": removing a pipeline
guardrail now means a red meta-ratchet, not a silently weakened
pipeline. Retiring a remediation stays possible — delete the
guardrail AND its registry entry in one diff — but that is now an
explicit, reviewed act.

`docs/ci-cd-pipeline-integrity.md` is the unified map: pillar →
risk → remediation → guardrail.

## Files

| File | Role |
|------|------|
| `.github/workflows/ci.yml` | Build step gains a comment documenting the deliberate `SKIP_ENV_VALIDATION` skip + the runtime gate. |
| `tests/guards/ci-pipeline-integrity.test.ts` | NEW — the meta-ratchet: guards the five pipeline guardrails + locks the build/env posture. |
| `docs/ci-cd-pipeline-integrity.md` | NEW — unified pillar → risk → remediation → guardrail map. |

## Decisions

- **A meta-ratchet, not duplicated assertions.** The capstone does
  not re-check the workflows — the individual guardrails already
  do. It checks that those guardrail FILES exist and are not
  gutted. Two layers: meta-ratchet → guards → workflows.

- **"Not gutted" = anchors + `it`-count.** A guardrail emptied to
  `it('ok', () => {})` would still "exist". Requiring subject
  anchors (e.g. `smoke-staging` in the deploy gate) + ≥ 3
  `it`-blocks catches the gut-to-no-op move without being brittle.

- **Build/env-validation is documentation, not new enforcement.**
  The runtime fail-fast (GAP-03) was already guarded by
  `encryption-key-enforcement.test.ts` + `env.test.ts`. The
  remaining gap was that the build-time skip looked accidental.
  The fix is to make it explicitly intentional and lock that the
  explanation + the `skipValidation` wiring survive — honest to
  the prompt's "lower risk, still handle it deliberately".

- **The registry count is an explicit contract.** The meta-ratchet
  asserts exactly 5 guardrails. A drive-by deletion shrinks the
  registry; the count assertion turns that into a visible failure.

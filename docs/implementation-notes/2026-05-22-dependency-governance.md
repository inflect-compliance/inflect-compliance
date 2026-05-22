# 2026-05-22 — Dependency-governance capstone

**Commit:** `<pending> chore(deps): dependency-governance model + meta-ratchet`

## Design

The build-integrity roadmap's first two prompts each landed a
focused guardrail — `swc-version-coherence.test.ts` (#631) and
`dependency-risk-review.test.ts` (#632) — joining the two that
already existed from the CI/CD roadmap: `deterministic-install.test.ts`
and `no-legacy-peer-deps.test.ts` (#615). The roadmap's third prompt
asked for the *governance layer*: not another one-off fix, but a
model that ties the pieces together and a meta-ratchet so the set
cannot quietly erode.

This change adds exactly that, and nothing structural — every
mechanism the prompt named was already in place:

- **`--legacy-peer-deps`** was already removed (#615) and locked by
  `no-legacy-peer-deps.test.ts`.
- **SWC version skew** was already fixed (#615) and locked by
  `swc-version-coherence.test.ts` (#631).
- **The 4-package CVE audit** already shipped (#632) with its
  `dependency-risk-review.test.ts` ratchet.
- **NextAuth v5** is still beta-only (`latest` dist-tag = `4.24.14`
  as of 2026-05-22); the v4 pin is already locked by
  `auth-stack-pinning.test.ts`.

So the capstone is documentation + a meta-ratchet, the same shape as
the three prior domain capstones (`ci-pipeline-integrity`,
`observability-reliability-integrity`, `verification-integrity`).

`docs/dependency-governance.md` is the new single entry point. It
names the **four governance pillars** (deterministic installs,
strict peer resolution, framework version coherence, reviewed
runtime risk) plus the narrower auth-stack pin, maps each to its
enforcing guardrail, and — the genuinely new contributor-facing
content — states the **dependency lifecycle**: how to add, upgrade,
and remove a dependency safely. It also writes down the NextAuth
stay-on-v4 policy with an explicit recheck trigger (the `latest`
dist-tag advancing to a real `5.x.x` GA).

`dependency-governance-integrity.test.ts` is the meta-ratchet — the
fourth "guard the guards" test. It registers all five dependency
guardrails, asserts each exists, still contains its subject anchors,
and carries ≥3 `it`-blocks; and asserts the three governance docs
survive with their load-bearing policy statements (four-pillar
model, NextAuth policy, contributor lifecycle, bridge-vs-security
override) intact.

A short `.github/PULL_REQUEST_TEMPLATE.md` carries a *deletable*
dependency checklist — the contributor-workflow surface the prompt
asked for, kept lightweight so it adds no friction to PRs that touch
no dependencies.

## Files

| File | Role |
|------|------|
| `docs/dependency-governance.md` | NEW — the unified governance model: four pillars, contributor lifecycle, NextAuth policy, override taxonomy, CI surface. |
| `tests/guards/dependency-governance-integrity.test.ts` | NEW — meta-ratchet: guards the five dependency guardrails + the three governance docs. |
| `.github/PULL_REQUEST_TEMPLATE.md` | NEW — short PR template with a deletable dependency-change checklist. |
| `docs/dependency-policy.md` | Header note pointing at the governance model as the entry point. |
| `docs/dependency-risk-review.md` | Same header cross-link. |

## Decisions

- **A capstone, not a re-fix.** Every concrete mechanism the prompt
  described was already implemented and locked. The honest,
  on-scope deliverable is the governance *model* — the layer that
  makes the existing guardrails legible as one system and resistant
  to silent erosion. Re-doing settled work would have been noise.

- **Meta-ratchet over the guardrails, not over `package.json`.**
  The four pillar guardrails already assert the `package.json` /
  lockfile facts directly. A second test re-asserting the same
  facts would be duplication. The meta-ratchet instead guards a
  different regression class — *deletion or gutting of a guardrail* —
  exactly as the three prior domain capstones do.

- **Five entries, not four.** `auth-stack-pinning.test.ts` lives in
  `tests/guardrails/` (not `tests/guards/`) and predates this
  roadmap, but it *is* the enforcement of the NextAuth stay-on-v4
  policy the governance doc states. Registering it keeps the
  meta-ratchet honest: the policy and its enforcement cannot drift
  apart.

- **The PR template's dependency section is explicitly deletable.**
  The prompt asked for a contributor-workflow touch but warned
  against bureaucracy. A checklist that the author deletes whenever
  `package.json` is untouched costs nothing on the common path and
  is a useful prompt on the rare one.

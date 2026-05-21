# CI/CD pipeline integrity

The build / test / release pipeline is protected by four
remediations. Each closed a concrete weakness AND shipped a
structural guardrail that fails CI if the weakness returns — the
pipeline cannot silently drift back. This doc is the map.

| Pillar | Risk it closes | Guardrail |
|--------|----------------|-----------|
| 1. Dependency-install integrity | Peer conflicts masked; non-deterministic installs | `no-legacy-peer-deps.test.ts`, `deterministic-install.test.ts` |
| 2. E2E test isolation | Shared describe-block state cascades failures | `e2e-isolation.test.ts` |
| 3. Staging smoke gate | Production deploy with no staging validation | `deploy-staging-gate.test.ts`, `deploy-workflow.test.ts` |
| 4. Build / env-validation discipline | Build-time env-validation skip is implicit | `ci-pipeline-integrity.test.ts` |

All guardrails live in `tests/guards/` and run in the CI **Test**
job. The **meta-ratchet** (`ci-pipeline-integrity.test.ts`) guards
the guards — see the last section.

---

## 1. Dependency-install integrity

**Risk.** `--legacy-peer-deps` disables npm's peer-dependency
validation wholesale, masking real incompatibilities. `npm install`
re-resolves semver ranges and can rewrite `package-lock.json`
mid-run, so two CI runs of the same commit are not guaranteed
identical, and a corrupt lockfile is silently "repaired".

**Remediation.** No install path passes `--legacy-peer-deps`
(strict peer resolution; a granular `overrides` block records the
accepted mismatches). Every install path — `Dockerfile` + all CI
workflows — runs `npm ci`, which installs exactly the lockfile tree
and hard-fails on a drifted lockfile. A Node/npm `engines` policy +
`.nvmrc` pin the runtime.

**Guardrails.** `no-legacy-peer-deps.test.ts` (the flag cannot
re-enter any install path); `deterministic-install.test.ts`
(install paths use `npm ci`, `engines` declared, Node version
consistent). **Details:** `docs/dependency-policy.md`.

## 2. E2E test isolation

**Risk.** E2E specs that share state — a `tenantSlug` or resource
id stored in a module-level `let` and read across `test()`s, or
many specs writing to the one seeded tenant — cascade: one failed
setup step poisons every later test.

**Remediation.** Read-only specs keep the shared seeded tenant
(they need its seed data; read-only access cannot cascade).
Mutating specs provision a fresh, empty per-test tenant via the
`isolatedTenant` fixture (`tests/e2e/fixtures.ts`). No `test()`
depends on a `let` assigned by another `test()`.

**Guardrail.** `e2e-isolation.test.ts` — static analysis that fails
CI if any spec assigns a top-level `let`/`var` in one `test()` and
reads it in another. **Details:** the E2E section of `CLAUDE.md` +
`docs/implementation-notes/2026-05-21-e2e-isolation.md`.

## 3. Staging smoke gate

**Risk.** `deploy.yml` could deploy straight to production without
the image ever being validated on staging.

**Remediation.** A `production` target promotes through staging in
one run: `deploy-staging → smoke-staging → deploy-production →
smoke-production`. `deploy-production` declares
`needs: [smoke-staging]` — GitHub Actions never starts a job whose
`needs` dependency failed, so production cannot deploy unless the
same image first passed staging smoke. The `production` GitHub
Environment's required-reviewers rule is the human approval on top.

**Guardrails.** `deploy-staging-gate.test.ts` (the `needs:
smoke-staging` edge + gate jobs); `deploy-workflow.test.ts` (the
OI-2 helm invariants). **Details:** the "Deploying" section of
`docs/deployment.md`.

## 4. Build / env-validation discipline

**Risk — lower than 1–3, handled deliberately.** The CI **Build**
job runs `npx next build` with env validation skipped. Skipping is
*correct* — CI has only dummy secrets — but it was implicit, so a
reader could mistake a green Build for an env-config pass.

**Remediation.** The skip is now explicit. `SKIP_ENV_VALIDATION:
"1"` at the workflow level makes `src/env.ts` skip its zod check at
build time; the **Build** step carries a comment stating this is
deliberate and naming the real gate.

**The real env gate is runtime, not build time:**
- `src/env.ts` validates on process start when `SKIP_ENV_VALIDATION`
  is unset (i.e. in production);
- `src/instrumentation.ts` runs the GAP-03 fail-fast startup checks
  (encryption key, Redis auth, …).

A green Build job is therefore **not** an env-config pass — runtime
is. That runtime fail-fast is itself guarded by
`encryption-key-enforcement.test.ts` and `env.test.ts`.

**Guardrail.** `ci-pipeline-integrity.test.ts` locks the posture:
`SKIP_ENV_VALIDATION` is set, the explanatory comment survives, and
`src/env.ts` still honours the flag.

---

## The meta-ratchet — guarding the guards

`tests/guards/ci-pipeline-integrity.test.ts` is the capstone. It
carries a registry of the five pipeline guardrails and fails CI if
any of them is **deleted** or **gutted to a no-op** (the file must
exist, still contain its subject anchors, and carry a real
assertion surface).

The intent: a contributor who removes a pipeline guardrail must
reckon with a red meta-ratchet, not a silently weakened pipeline.
Retiring a remediation is legitimate — but it means deleting the
guardrail AND its registry entry in the same diff, which is the
design conversation, made explicit.

When you add a new pipeline guardrail, add it to the `GUARDRAILS`
registry in the meta-ratchet (and bump the count assertion).

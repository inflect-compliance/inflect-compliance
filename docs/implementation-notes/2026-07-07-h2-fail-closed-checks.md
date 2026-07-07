# 2026-07-07 — H2: fail-closed check semantics + NOT_APPLICABLE

**Commit:** `<pending>` fix(h2): never report a false green — fail-closed checks + NOT_APPLICABLE

## Design

The most dangerous class in the post-merge scan: a compliance product
manufacturing passing evidence it hasn't earned. Several check paths reported
`PASSED` when the check was broken, data-less, or hardcoded — and one path then
**auto-closed real Findings and wrote APPROVED evidence** off that false pass.

### 1. New status: `NOT_APPLICABLE`
Added to `CheckResult.status` and the `IntegrationExecutionStatus` Prisma enum
(migration `20260707180000_check_not_applicable`). It means "the check ran
cleanly but its applicable population was empty" — rendered distinctly (neutral
badge, `ControlChecksTab`) and, critically, it **never closes a finding or
writes APPROVED evidence**.

### 2. Collectors fail closed
`powerpipe-core.ts` + `aws-posture-provider.ts` parsed `res.stdout || '{}'`
without checking `res.ok`, so a non-zero CLI exit (revoked credential) with
empty stdout parsed to zero controls → `PASSED`. Now: `!res.ok` → ERROR, and
`counts.total === 0` (zero parsed controls) → ERROR. Only ≥1 parsed control
with a real status can yield PASSED.

### 3. The finding-erasure path is gated on a real PASS
`automation-runner.ts`: evidence creation now requires `PASSED|FAILED` (never
ERROR/NOT_APPLICABLE), and `reconcileFindingForCheck` early-returns on
ERROR **and** NOT_APPLICABLE — so a broken/empty run can no longer auto-close
open findings.

### 4. Empty populations → NOT_APPLICABLE
Identity (`summarize` + admin/mfa/sso judged only over accounts whose signal is
known), device, personnel (per-check applicable population), and training all
return NOT_APPLICABLE on an empty/all-N-A population instead of a vacuous PASS.

### 5. Always-green hardcodes → honest signals or "unknown"
Signals the provider can't reliably determine are now `null` (unknown) on
`NormalizedIdentityAccount`, and a check whose whole population is unknown
returns NOT_APPLICABLE rather than a hardcoded pass:
- Okta `isAdmin` (needs group/role enrichment the users-list endpoint lacks) → `null`.
- Okta `mfaEnrolled` (factors aren't on the users-list endpoint) → `null` unless factors present.
- Google `ssoEnrolled` (per-user SAML assignment isn't in the basic user object) → `null`.
- Google `isAdmin`/`mfaEnrolled` are real Directory-API fields — kept.
BambooHR now emits **ONBOARDING** (pre-hire / future start) and **OFFBOARDING**
(pending termination) from the hire/termination dates, and
`offboarded_access_removed` treats OFFBOARDING as in-scope. Training open
assignments with **no due date** no longer silently pass (surfaced as a gap).

### 6. Injection abort on auto-draft surfaces
New `assertNoReviewRequired` guard helper. The questionnaire + assistant input
guards now abort on ANY review-required verdict (flag OR block), so under the
default `balanced` mode an injected input (`malicious` → `flag`) never reaches
the LLM/router.

## Files (representative)

| File | Role |
| --- | --- |
| `integrations/types.ts`, `enums.prisma` + migration | `NOT_APPLICABLE` status |
| `cloud-posture/powerpipe-core.ts`, `aws-posture-provider.ts` | collector fail-closed |
| `jobs/automation-runner.ts` | evidence + finding reconcile gated on real PASS |
| `providers/identity/types.ts` | empty/unknown → NOT_APPLICABLE; nullable signals |
| `providers/{okta,google-workspace,hris}/index.ts` | honest signals / ONBOARDING-OFFBOARDING |
| `providers/{device,personnel,training}/checks.ts` | empty population → NOT_APPLICABLE; training null-due |
| `ai/guard/index.ts`, `usecases/{questionnaire,assistant}.ts` | injection abort on review-required |
| `_tabs/ControlChecksTab.tsx` | render NOT_APPLICABLE distinctly |
| `tests/unit/h2-fail-closed.test.ts` | fail-closed matrix across every family |

## Decisions

- **"Unknown" (`null`) beats a hardcoded boolean.** Real enrichment for Okta
  admin/MFA and Google SAML needs external API work that can't be validated
  here; per the prompt's sanctioned alternative, marking the signal unknown →
  NOT_APPLICABLE is honest and testable, and the check can light up for real the
  moment enrichment lands (no always-green shipped).
- **Per-check applicable population, not a blanket helper.**
  `offboarded_access_removed` counts unrelated active accounts, so its
  NOT_APPLICABLE gate keys on the *departing* population, not passed+failed —
  an all-deprovisioned departing set is a genuine PASS, an empty one is N/A.
- **The DB account cache stays non-nullable** (`isAdmin ?? false` at the sync
  write) — the authoritative check runs on the live fetch, so the cache losing
  the unknown distinction is harmless.

# 2026-06-25 — Business-level KPI metrics + Grafana dashboard

**Commit:** `feat(observability): business-level KPI metrics + Grafana dashboard`

## Design

A second OTel metrics module (`business-metrics.ts`) emitting PRODUCT
signals (tenant growth, onboarding funnel, feature adoption, plan mix)
alongside the existing infrastructure metrics. Reuses the SAME meter
(`inflect-compliance`) — no new instrumentation surface. 21 metrics
(19 counters + 2 observable gauges). Each counter is recorded ONCE at
its owning usecase boundary, AFTER the mutation commits. The two gauges
(DAU/MAU) are fed by a 5-minute cross-tenant aggregator job via a cached
snapshot. Full catalogue + cardinality rules + DAU/MAU definition live
in `docs/observability/06-business-kpis.md`.

## Premise corrections (the brief was ~75% accurate)

Verified against the live code before wiring:

- **Catalogue is 21 metrics, not "14"** (the brief's ratchet text
  miscounted its own catalogue).
- `deleteTenant` doesn't exist → tenant deletion is
  `org-tenants.ts::deleteTenantUnderOrg`.
- `billing.ts::changePlan` and a Stripe webhook **don't exist** → the
  plan-change boundary is **net-new** (`changeTenantPlan` usecase +
  `POST /api/t/:slug/admin/billing/plan`). User chose "full build".
- The onboarding-abandonment job is **net-new** (the brief assumed it
  existed).
- MFA is **TOTP-only** (`mfa-enrollment.ts::verifyMfaEnrollment`); no
  WebAuthn enrolment exists.
- `STEP_ORDER` is **7 steps** (COMPANY_PROFILE, FRAMEWORK_SELECTION,
  ASSET_SETUP, CONTROL_BASELINE_INSTALL, INITIAL_RISK_REGISTER,
  TEAM_SETUP, REVIEW_AND_FINISH); functions are `completeOnboardingStep`
  / `finishOnboarding`.
- `createRisk` has no `source` input (Risk.source defaults MANUAL → the
  boundary emits `source: 'manual'`); `createControl` lives in
  `control/mutations.ts`; `createAutomationRule` (not `createRule`);
  `createAuditCycle` in `audit-readiness/cycles.ts`.
- `assertWithinLimit` gates only `'control'` today → `plan.limit.hit`
  currently only fires for `resource=control`.

## Metric → call-site

| Metric | Wiring point |
|--------|--------------|
| tenant.created | `tenant-lifecycle.ts::createTenantWithOwner` (platform) + `auth/register/route.ts` (credentials) |
| tenant.deleted | `org-tenants.ts::deleteTenantUnderOrg` |
| user.signup | `auth/register/route.ts` (+ best-effort OAuth new-user path in `auth.ts`) |
| invite.sent / .redeemed | `tenant-invites.ts::createInviteToken` / `redeemInvite` |
| user.mfa.enrolled | `mfa-enrollment.ts::verifyMfaEnrollment` (totp) |
| onboarding.step.completed | `onboarding.ts::completeOnboardingStep` |
| onboarding.completed | `onboarding.ts::finishOnboarding` |
| onboarding.abandoned | `jobs/onboarding-abandonment-sweep.ts` (daily) |
| framework.installed | `framework/install.ts::installPack` |
| policy.published | `policy.ts::publishPolicy` |
| audit.cycle.started | `audit-readiness/cycles.ts::createAuditCycle` |
| audit.pack.shared | `audit-readiness/sharing.ts::generateShareLink` |
| risk.created | `risk.ts::createRisk` |
| control.created | `control/mutations.ts::createControl` |
| automation.rule.created | `automation-rules.ts::createAutomationRule` |
| plan.upgraded / .downgraded | `billing.ts::changeTenantPlan` |
| plan.limit.hit | `entitlements.ts::assertWithinLimit` (before the throw) |
| tenant.active.daily / .monthly | `jobs/dau-mau-aggregator.ts` (5-min) → gauge snapshot |

## Decisions

- **Cardinality is the whole game.** `tenant.id` is never a label
  (inherited from Epic OI-3); `plan` (4 enums) and the other bounded
  enums are fine; durations become pre-rounded bucket strings via
  `bucketTimeTo`. The ratchet
  (`tests/guardrails/business-metrics-coverage.test.ts`) enforces all
  three structurally + that every wiring point imports the module.
- **Record AFTER commit, not inside the tx.** A rolled-back mutation
  must not emit the metric. The one nuance: `completeOnboardingStep`
  has an idempotency short-circuit (returns early when the step was
  already complete) — the metric fires only on the genuine-completion
  path so repeated calls don't double-count.
- **DAU/MAU via snapshot, not scrape-time query.** The expensive
  cross-tenant DISTINCT runs every 5 min in the aggregator job; the
  observable gauges read the cached snapshot, so scrape cost is O(1).
  "Distinct" is per-plan (a user active across two same-plan tenants
  counts once for that plan). Both windows read `AuditLog` (not
  `UserSession`) so DAU/MAU share one "active = audit-logged action"
  definition and `AuditLog` is already index-triaged — avoiding a
  `UserSession.lastActiveAt` index migration. Trade-off: read-only
  activity isn't counted (acceptable — "made a change" is the
  engagement signal that matters for a compliance tool).
- **Onboarding-abandonment fires once.** The daily sweep only counts
  rows whose last activity falls in the `[7d, 8d)` window — with a
  daily cadence each abandoned onboarding crosses that window on exactly
  one run, so no schema flag is needed to dedupe.
- **Plan-change is the net-new boundary.** No Stripe webhook exists;
  `changeTenantPlan` (SAAS-only) is the single first-party plan-change
  path, gated `admin.tenant_lifecycle` (OWNER-only). Upgrade vs
  downgrade is decided by a fixed plan rank.
- **`business.user.signup` from OAuth is best-effort.** Detecting a
  genuinely-new OAuth user inside the NextAuth callback without a
  behaviour change is fragile; the credentials register route is the
  guaranteed emitter. The ratchet does not require `auth.ts` wiring.
- **No revenue, no per-tenant.** Out of scope by design — revenue lives
  in Stripe; per-tenant detail is the admin panel's job (the cardinality
  discipline guarantees Grafana can't show it).

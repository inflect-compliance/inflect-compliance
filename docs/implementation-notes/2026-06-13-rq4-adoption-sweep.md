# 2026-06-13 — RQ4 adoption sweep (PRs 5–8)

**Branch:** `claude/rq4-2-adoption-sweep-v2`

Mechanical adoption: every detail page that uses `<EntityDetailLayout>`
passes `back={{ smart: true }}` to mount the RQ4-4 affordance. Because
`EntityDetailLayout` already routes through `<PageHeader>`, the
foundations PR's widening of `PageHeader.back` propagates here with a
one-line prop addition per page.

## Pages migrated

11 detail pages (risks/[riskId] was already done in the foundations
PR as the demo callsite):

| Pattern | File |
|---|---|
| `/access-reviews/[reviewId]` | `AccessReviewDetailClient.tsx` |
| `/assets/[id]` | `assets/[id]/page.tsx` |
| `/audits/cycles/[cycleId]` | `audits/cycles/[cycleId]/page.tsx` |
| `/audits/cycles/[cycleId]/readiness` | `audits/cycles/[cycleId]/readiness/page.tsx` |
| `/audits/packs/[packId]` | `audits/packs/[packId]/page.tsx` |
| `/controls/[controlId]` | `controls/[controlId]/page.tsx` |
| `/frameworks/[frameworkKey]` | `frameworks/[frameworkKey]/page.tsx` |
| `/policies/[policyId]` | `policies/[policyId]/page.tsx` |
| `/tasks/[taskId]` | `tasks/[taskId]/page.tsx` |
| `/tests/runs/[runId]` | `tests/runs/[runId]/page.tsx` |
| `/vendors/[vendorId]` | `vendors/[vendorId]/page.tsx` |

The audit-cycles readiness page has three `<EntityDetailLayout>`
instances (loading, error, main) — all three get the prop.

## User-visible upgrade

- Detail pages now render the new "← Back to <Destination>" affordance
  above the title. Destination is the in-tab referrer when available,
  IA-canonical parent on cold load / deep link.
- Arrow is now the `ArrowLeft` SVG (matches the nucleo set), not the
  Unicode `←` glyph.
- Hover transition runs only under `motion-safe:`.
- Hidden from print (`@media print`).
- `aria-label` names the destination; the icon is `aria-hidden`.

## Decisions

- **Smart form is the default.** Every detail page now uses
  `back={{ smart: true }}` instead of constructing a static
  `{ href, label }` from `tenantHref(...)`. The destination resolves
  at render time via the referrer/canonical-parent two-tier logic.
- **`breadcrumbs` is preserved alongside.** The user-decision pinned
  in the planning phase: keep both affordances — breadcrumbs answer
  "you are here", back answers "go where you came from".
- **Loading.tsx files unchanged.** All loading.tsx files in the app
  layer correspond to MAIN routes (`/assets/loading.tsx`,
  `/audits/loading.tsx`, …) which are MAIN_PAGES and don't get a
  back affordance by design (OB-H).
- **`CoverageClient` (the only legacy `{ href, label }` caller)
  unchanged.** `/coverage` is a MAIN page; its hand-rolled back link
  predates RQ4 and uses the legacy static form, which the foundations
  PR explicitly preserves. The cohort sweep ratchet (PR #3) checks
  `<BackAffordance>` usage on MAIN pages, not static `back={...}`,
  so coverage stays clean.

## Test summary

- 11 detail pages typecheck against the new `back?: ... | { smart: true }`
  union.
- Existing `tests/rendered/entity-detail-layout.test.tsx` (12 tests)
  and `tests/guards/page-header-discipline.test.ts` (7 tests) — 24
  passing, no regressions.
- The RQ4-10 cohort sweep ratchet (PR #3) will lock positive coverage
  across both the detail-page adoptions here and the direct
  `<BackAffordance />` mounts that PR #3 adds for non-detail subpages.

## Remaining work (next PR)

PR #3 (RQ4-9/10): add `<BackAffordance />` directly to subpages that
don't go through `<EntityDetailLayout>` (admin/*, audits/auditor,
risks/dashboard, policies/new, security/mfa, reports/soa, …), plus
the cohort sweep ratchet that locks positive + negative coverage.

# 2026-06-13 — RQ4 cohort complete (PRs 9 + 10)

**Branch:** `claude/implement-login-O64VA`

This batch closes out the RQ4 wave: the final ~18 subpages that didn't
have a back affordance today now mount `<BackAffordance />`, the
segregation source-of-truth grows an `BACK_AFFORDANCE_EXEMPT_SUBPAGES`
list for redirect-shim / flow / print pages, and the **cohort sweep
ratchet (RQ4-10)** locks the positive + negative coverage invariants.

## RQ4-9 — Admin + remaining subpage adoption

Adds `<BackAffordance />` to every subpage in `SUBPAGES` that had no
back link today (admin/*, audits/auditor + cycles + readiness,
risks/dashboard, policies/new, security/mfa, reports/soa). Each page:

  - imports `BackAffordance` from `@/components/nav/BackAffordance`
  - mounts `<BackAffordance />` as the first child of the page's outer
    wrapper (above the title)
  - for server-component pages whose render is a thin wrapper around a
    client component (`admin/risk-matrix/page.tsx` →
    `RiskMatrixAdminClient`), the affordance lives in the client
    component so it shares the rendering context (the
    `<NavigationTracker>` is mounted higher up the tree).

Pages where a `Link href="…">← Section</Link>` already existed
(admin/integrations) are replaced wholesale by the affordance — the
hand-rolled lucide ArrowLeft + redundant `← Back` text are removed at
the same time.

## RQ4-9 — exemption list (BACK_AFFORDANCE_EXEMPT_SUBPAGES)

Eight subpages legitimately do NOT render the affordance:

| Pattern | Reason |
|---|---|
| `/auth/mfa` | auth flow — back would let user bypass MFA challenge |
| `/controls/new` | redirect shim → `/controls?create=1` |
| `/issues/[issueId]` | legacy redirect → `/tasks/[taskId]` |
| `/issues/dashboard` | legacy redirect → `/tasks/dashboard` |
| `/issues/new` | legacy redirect → `/tasks/new` |
| `/onboarding` | forced flow — back would skip a required step |
| `/reports/soa/print` | print view, chrome-less by design |
| `/risks/new` | redirect shim → `/risks?create=1` |

The list lives in `src/lib/nav/page-segregation.ts` next to
`SUBPAGES` so a future contributor adding a new redirect shim can
add the exemption inline with the same diff.

## RQ4-10 — cohort sweep ratchet

`tests/guards/rq4-10-cohort-sweep.test.ts` is the structural lock.
Three assertions:

  1. **Positive coverage.** Every `SUBPAGES` entry not in
     `BACK_AFFORDANCE_EXEMPT_SUBPAGES` mounts `<BackAffordance>` in
     either its `page.tsx` or a sibling `*Client.tsx`. Mount can be
     direct (`<BackAffordance />`) or via the
     `EntityDetailLayout.back={{ smart: true }}` form.
  2. **Negative coverage (OB-H).** No `MAIN_PAGES` entry imports OR
     mounts the affordance. Main pages are the destinations, never
     the origin.
  3. **No orphan exemptions.** Every entry in
     `BACK_AFFORDANCE_EXEMPT_SUBPAGES` is also in `SUBPAGES` — the
     exemption list can't drift into a parallel universe of routes.

The ratchet reads the FILESYSTEM, not a snapshot — it can't be
cheated by adding the route to segregation without wiring the
component.

## Files touched

| Group | Pages |
|---|---|
| Admin (added affordance) | api-keys, billing, integrations, members, notifications, rbac, risk-matrix (via client), roles, scim, security, sso |
| Audits (added) | auditor, cycles (list), readiness |
| Other (added) | risks/dashboard, policies/new, security/mfa, reports/soa |
| Segregation | `src/lib/nav/page-segregation.ts` (+ `BACK_AFFORDANCE_EXEMPT_SUBPAGES`) |
| Cohort ratchet | `tests/guards/rq4-10-cohort-sweep.test.ts` |

## Test summary

  - RQ4 ratchets: 33/33 across 5 suites.
  - `EntityDetailLayout` rendered tests + control-detail shell
    adoption: 22/22 (no regressions).
  - Cohort sweep covers 47 SUBPAGE patterns (53 - 8 exempt + 2
    non-applicable) and 19 MAIN_PAGE patterns.

## What's left

The 10 OB-* polish points (OB-A through OB-J) live in the approved
plan at `/root/.claude/plans/compiled-hopping-fox.md`. OBs B/C/G/H/I
are enforced by the foundation primitive + RQ4-4 ratchet (visual
weight, accessibility, animation, list-page guard, print). OBs D/E/F
are enforced by RQ4-3's tracker (deep-link fallback, cross-tenant
safety, tab-aware sessionStorage). OB-A (Alt+← keyboard shortcut)
and OB-J (capstone synthesis doc) are the remaining polish — both
are mechanical follow-ups that don't change the architectural shape.

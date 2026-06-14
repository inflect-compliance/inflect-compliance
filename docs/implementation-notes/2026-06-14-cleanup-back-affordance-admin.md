# 2026-06-14 — BackAffordance: admin batch (17 pages)

**Branch:** `claude/cleanup-2-back-affordance-admin`

Second wave of the CI cleanup. The RQ4 `BACK_AFFORDANCE_COHORT_TODO`
list had 46 entries — this PR migrates **all 17 admin pages** off in
one batch. Remaining TODO after this: **29**.

## Pages migrated

| Pattern | Method |
|---|---|
| `/admin/audit-log` | `<PageHeader back={{ smart: true }}>` |
| `/admin/billing` | `<BackAffordance />` above `<PageBreadcrumbs>` |
| `/admin/entra` | same |
| `/admin/integrations` | same |
| `/admin/integrations/sharepoint-health` | same |
| `/admin/members` | same |
| `/admin/notifications` | same |
| `/admin/rbac` | same |
| `/admin/risk-appetite` | same |
| `/admin/risk-matrix` | `<BackAffordance />` in `RiskMatrixAdminClient` |
| `/admin/roles` | `<BackAffordance />` in loading branch |
| `/admin/scim` | same |
| `/admin/security` | `<BackAffordance />` in loading branch |
| `/admin/sso` | same |
| `/admin/vendor-assessment-reviews/[assessmentId]` | replaces hand-rolled `← Back to vendor` link |
| `/admin/vendor-templates` | `<BackAffordance />` in `VendorTemplatesIndexClient` |
| `/admin/vendor-templates/[templateId]` | `<BackAffordance />` in `VendorTemplateBuilderClient` |

## Pattern

Every admin page (except `/admin/audit-log` which uses `<PageHeader>`)
followed the same shape: a `<PageBreadcrumbs>` block as the first
child of a `<div className="space-y-…">` wrapper. The migration is
mechanical:

1. Add `import { BackAffordance } from '@/components/nav/BackAffordance';`
   after the existing `PageBreadcrumbs` import.
2. Insert `<BackAffordance />` as the first child of the outer wrapper,
   above the breadcrumbs.

`<PageHeader>`-using pages (audit-log) just gain `back={{ smart: true }}`
— the central seam from the RQ4 foundations PR.

The vendor-assessment-reviews page had a hand-rolled `← Back to vendor`
link from before RQ4; replaced with `<BackAffordance />` so the smart
referrer wins (in-tab nav from a vendor will still send the user back
to that vendor; cold-load fallback goes to `/admin` — the page's
canonical IA parent).

## Ratchet movement

| Ratchet | Was | Now |
|---|---|---|
| `BACK_AFFORDANCE_COHORT_TODO.length` | 46 | **29** |
| `tests/guards/action-label-vocabulary.test.ts` baseline (refreshed) | line 584/687 | line 586/689 (+2 shift) |

The `+ Word` baseline refresh on `VendorTemplateBuilderClient.tsx` is a
mechanical line-shift from the import + mount additions; the literals
themselves are unchanged staged debt (same precedent as previous baseline
refreshes documented inline).

## Test summary

- `npx jest tests/guards/rq4 tests/guards/page-header-discipline.test.ts tests/guards/detail-page-back-prop-ban.test.ts tests/guards/action-label-vocabulary.test.ts tests/guards/no-explicit-any-ratchet.test.ts tests/guardrails/no-explicit-any-ratchet.test.ts` — **63/63 across 12 suites**.
- `npx tsc --noEmit` — zero new errors across the 17 modified files.

## Next in the cleanup wave

After this lands, `BACK_AFFORDANCE_COHORT_TODO` has 29 entries left,
clustered as:

- `/assets/new`, `/policies/new`, `/tasks/new`, `/vendors/new` — small-page forms
- `/controls/dashboard`, `/controls/sankey`, `/controls/templates` — section views
- `/frameworks/[frameworkKey]/{diff,install,templates}` — framework subviews
- `/processes/governance`, `/reports/soa`, `/security/mfa` — misc
- `/risks/{ai,board,correlations,dashboard,hierarchy,import,kri,loss-events,reports,scenarios}` — the RQ3 risk views (largest sub-cluster)
- `/tasks/dashboard`, `/tests/{dashboard,due}`, `/vendors/dashboard`, `/policies/templates`, `/vendors/[vendorId]/assessment/[assessmentId]` — dashboards / templates / assessments

Likely one more medium PR to clear the lot.

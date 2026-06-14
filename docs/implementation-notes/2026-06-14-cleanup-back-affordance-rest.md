# 2026-06-14 — BackAffordance: TODO list reaches zero

**Branch:** `claude/cleanup-3-back-affordance-rest`

Third wave of the CI cleanup. After [PR #1067](https://github.com/inflect-compliance/inflect-compliance/pull/1067) (`as any` → 0) and [PR #1068](https://github.com/inflect-compliance/inflect-compliance/pull/1068) (admin batch: 46 → 29), this PR clears the remaining **29 entries** from `BACK_AFFORDANCE_COHORT_TODO`. The list is now empty.

## Migration breakdown

### 4 `*/new` redirect shims moved to EXEMPT

These were misclassified as TODO. They're redirect shims (just `redirect()` calls) with no UI to attach the affordance to — same pattern as the already-EXEMPT `/controls/new`, `/risks/new`, `/audits/new`, and `/issues/new`.

- `/assets/new` → EXEMPT
- `/policies/new` → EXEMPT
- `/tasks/new` → EXEMPT
- `/vendors/new` → EXEMPT

### 6 DashboardLayout pages — `back: { smart: true }` in header prop

`DashboardLayout` forwards its `header` prop straight to `<PageHeader>`. Adding `back: { smart: true }` to the object is the single-line equivalent of `<BackAffordance />`.

- `/controls/dashboard`, `/risks/board`, `/risks/dashboard`, `/tasks/dashboard`, `/tests/dashboard`, `/vendors/dashboard`

### 1 ListPageShell page — `<BackAffordance />` inside `Header` slot

- `/tests/due`

### 18 plain-wrapper pages — `<BackAffordance />` mounted directly

- `/controls/sankey`, `/controls/templates`
- `/policies/templates`
- `/processes/governance`
- `/reports/soa`
- `/risks/{ai, correlations, hierarchy, import, kri, loss-events, reports, scenarios}`
- `/security/mfa`
- `/frameworks/[frameworkKey]/{diff, install, templates}` — replaces hand-rolled `← Back to {framework.name}` links
- `/vendors/[vendorId]/assessment/[assessmentId]` — replaces hand-rolled `← Back to Vendor` link
- `/risks/import` — replaces hand-rolled `←` link

## Ratchet movement

| Ratchet | Was | Now |
|---|---|---|
| `BACK_AFFORDANCE_COHORT_TODO.length` | 29 | **0** |
| `BACK_AFFORDANCE_EXEMPT_SUBPAGES.length` | 9 | 13 |

The cohort-sweep ratchet now enforces a **stricter** invariant — every SUBPAGE not on the EXEMPT list mounts `<BackAffordance>`. No more waivers; the TODO mechanism has done its job.

## One small ratchet extension

The cohort-sweep ratchet's `fileMountsBackAffordance` detector now also recognises the **object-literal form** `back: { smart: true }` (no JSX expression braces), which is how `DashboardLayout` consumers pass it through to `<PageHeader>`. Previously only `back={{ smart: true }}` (JSX prop form) was detected. Both forms are now equivalent first-class mounts.

## Test summary

- `npx jest tests/guards/rq4 tests/guards/page-header-discipline.test.ts tests/guards/detail-page-back-prop-ban.test.ts tests/guards/action-label-vocabulary.test.ts tests/guards/no-explicit-any-ratchet.test.ts tests/guardrails/no-explicit-any-ratchet.test.ts` — **63/63 across 12 suites**.
- `npx tsc --noEmit` — zero new errors across the 29 modified files.

## Cleanup wave progress

- ✅ PR A (#1067) — `as any` (4 → 0) **merged**
- ✅ PR B (#1068) — BackAffordance admin batch (46 → 29) **merged**
- 🟢 **PR C (this)** — BackAffordance final batch (29 → 0)
- ⏳ PR D — `action-label-vocabulary` (18 → 0)
- ⏳ PR E — Node base image bump (4 Trivy CVEs)
- ⏳ Deferred — `epic55-native-select` primitive build, `epic52-datatable` migration (both flagged as documented design choices, not bugs)

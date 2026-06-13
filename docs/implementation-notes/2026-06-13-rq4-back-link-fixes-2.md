# 2026-06-13 — RQ4 back-link fixes (round 2)

**Branch:** `claude/rq4-back-link-fixes-2`

User-reported gaps after PR #1065 landed. Two issues, fixed together.

## Issue 1 — Test plan back link still said "Back to Control"

The test plan detail page (`/controls/[controlId]/tests/[planId]`)
had a **hand-rolled** `← Back to Control` link at line 173 — pre-RQ4
hand-rolled markup. PR #1063's adoption sweep only touched pages that
already used `<EntityDetailLayout>`; the test plan page never did, so
its bespoke back link survived every wave of the RQ4 rollout.

PR #1065's fix to the canonical-parent map (`/controls/[controlId]/tests/[planId]`
→ `/tests`) was correct but had no visible effect because the
hand-rolled link rendered unconditionally above any `<BackAffordance>`
mount.

**Fix:** Replace the hand-rolled link with `<BackAffordance />`. The
smart referrer arm now wins — `/tests → /controls/[controlId]/tests/[planId]`
shows "Back to Tests" via the in-tab referrer; cold loads fall back
to `/tests` via the canonical parent.

## Issue 2 — Internal Audit subpages still missing back buttons

Three audit subpages were on `BACK_AFFORDANCE_COHORT_TODO` since PR
#1064 — the structural waiver mechanism allowed them to ship without
the affordance, queued for follow-up:

  - `/audits/auditor` — Auditor Portal
  - `/audits/cycles` — Audit Cycles list
  - `/audits/readiness` — Audit Readiness Overview

**Fix:** All three now mount `<BackAffordance />` above their title
(after the existing `<PageBreadcrumbs>`, which keeps both
affordances rendered alongside per the locked planning decision).

Plus `/audits/new`, also on the TODO list, was wrong-classified —
it's a redirect shim to `/audits?create=1`, the same pattern as
`/controls/new` and `/risks/new` which are in
`BACK_AFFORDANCE_EXEMPT_SUBPAGES`. Moved to EXEMPT.

## Files

| File | Role |
|---|---|
| `src/app/t/[tenantSlug]/(app)/controls/[controlId]/tests/[planId]/page.tsx` | Hand-rolled back link replaced with `<BackAffordance />` |
| `src/app/t/[tenantSlug]/(app)/audits/auditor/page.tsx` | `<BackAffordance />` mounted |
| `src/app/t/[tenantSlug]/(app)/audits/cycles/page.tsx` | `<BackAffordance />` mounted |
| `src/app/t/[tenantSlug]/(app)/audits/readiness/page.tsx` | `<BackAffordance />` mounted |
| `src/lib/nav/page-segregation.ts` | `/audits/new` → EXEMPT; 5 entries removed from COHORT_TODO |
| `tests/guards/action-label-vocabulary.test.ts` | Baseline +2 line shift on `/audits/cycles/page.tsx` (3 entries) |

## Decisions

- **Hand-rolled link removal is preferred over additive mount.** A
  page with both `<Link>← Back to X</Link>` AND `<BackAffordance />`
  would render two competing affordances. The pre-RQ4 link is
  removed wholesale; the smart system takes over.
- **`<PageBreadcrumbs>` stays.** The audit subpages keep their
  breadcrumb trail alongside the new back affordance — the
  user-decision pinned in RQ4 planning: keep both, they answer
  different questions.
- **No SECTION_LABELS additions needed.** `/controls/[controlId]`
  referrer still resolves to "Controls" (plural section name) via
  the existing map; the previous "Back to Control" singular came
  ONLY from the hand-rolled link, never the BackAffordance smart
  resolver.
- **`/audits/new` moves to EXEMPT, not migrated.** Same reasoning
  as `/controls/new` and `/risks/new` — the file does nothing but
  `redirect()` to `/audits?create=1`. There is no rendered UI to
  attach an affordance to.

## Test summary

- All four RQ4 ratchets + new fix-specific ratchet + page-header
  discipline + detail-page back-prop ban + action-label-vocabulary
  = **54/54 across 10 suites**.
- Zero new TS errors.

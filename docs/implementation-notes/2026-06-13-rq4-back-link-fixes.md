# 2026-06-13 — RQ4 back-link fixes

**Branch:** `claude/rq4-back-link-fixes`

Two user-reported gaps with the RQ4 back affordance, fixed together:

## Issue 1 — `/audits` neighbours had no "Back to Internal Audit" path

User flow: `/audits` (titled "Internal Audit" in copy) → `/clauses` or
`/findings` → no back affordance, no way to return except sidebar.
Same flow → `/frameworks/[frameworkKey]` rendered "Back to Audits" via
the smart referrer, using the raw segment name instead of the product
display name "Internal Audit".

Two root causes:

1. **`/clauses` and `/findings` are MAIN pages.** Per the RQ4 OB-H
   invariant ("no MAIN page renders an IA-canonical back fallback")
   they didn't mount `<BackAffordance>` at all — so the referrer arm
   couldn't fire either.
2. **`labelFromPathname` capitalised the first segment.** `/audits` →
   "Audits" (not "Internal Audit"), `/access-reviews` → "Access-reviews"
   (not "Access reviews"), etc.

Fixes:

- **New `noFallback` variant on `<BackAffordance>`.** When set, the
  component skips the canonical-parent branch and returns null when no
  in-tab referrer exists. OB-H stays intact — the user only ever sees
  a back link if they actually arrived from somewhere in the app, so
  the affordance is purely "where you came from" with no static "up".
- **New `REFERRER_ONLY_BACK_MAIN_PAGES` list in `page-segregation.ts`**
  — currently `['/clauses', '/findings']`. The cohort-sweep ratchet
  OB-H assertion is widened: entries on this list are allowed to
  mount, but ONLY via `<BackAffordance noFallback />`.
- **`/clauses/page.tsx` + `/findings/page.tsx`** mount
  `<BackAffordance noFallback />` above their title.
- **`SECTION_LABELS` map inside `BackAffordance.tsx`** — `/audits`
  → "Internal Audit", `/access-reviews` → "Access reviews", etc.
  `labelFromPathname` consults the map first; unmapped sections fall
  back to the simple capitalisation. Frameworks reached from
  `/audits` now correctly read "Back to Internal Audit".

## Issue 2 — Test-plan detail back path felt circular

User flow: `/tests` → click a test → `/controls/[controlId]/tests/[planId]`
showed "Back to Control" (canonical fallback). Pressing it landed on
`/controls/[controlId]` which then showed "Back to Controls". From the
user's mental model the test page belongs to **Tests**, not to a
specific control — the URL nesting is a structural artefact of the
schema (a test plan is owned by a control row), not a navigation
choice.

Fix: the canonical parent for `/controls/[controlId]/tests/[planId]`
is now `{ href: '/tests', label: 'Tests' }`. The smart referrer still
wins — if the user drills in from a control detail page, the in-tab
referrer is `/controls/[controlId]` and the affordance reads
"Back to Controls" (via `labelFromPathname`). The change is to the
**fallback** for when there's no referrer (cold load, deep link,
fresh tab) — those now land on `/tests`, matching the user's expectation.

## Files

| File | Role |
|---|---|
| `src/components/nav/BackAffordance.tsx` | `noFallback` prop + `SECTION_LABELS` map |
| `src/lib/nav/canonical-parents.ts` | test-plan canonical parent → `/tests` |
| `src/lib/nav/page-segregation.ts` | new `REFERRER_ONLY_BACK_MAIN_PAGES` list |
| `src/app/t/[tenantSlug]/(app)/clauses/page.tsx` | mounts `<BackAffordance noFallback />` |
| `src/app/t/[tenantSlug]/(app)/findings/page.tsx` | mounts `<BackAffordance noFallback />` |
| `tests/guards/rq4-10-cohort-sweep.test.ts` | OB-H widened to allow `noFallback` mounts |
| `tests/guards/rq4-back-link-fixes.test.ts` | new fix-specific ratchet |

## Tests

54/54 across 10 suites — RQ4 ratchets (5), back-link fixes (1), page-header
discipline, detail-page back-prop ban, action-label vocabulary, plus
existing entity-detail rendered tests. Zero new TS errors.

## Decisions

- **`noFallback` over reclassifying as SUBPAGE.** `/clauses` and
  `/findings` are genuinely top-level destinations in the sidebar.
  Reclassifying would imply they have a canonical parent — they
  don't. The `noFallback` variant preserves their MAIN-ness while
  letting the affordance carry the "where you came from" link.
- **`SECTION_LABELS` map vs i18n thread.** A label map in the
  component keeps the fix tight; a proper i18n thread is the
  follow-up. The strings are short, consistent, and rarely change —
  the upgrade is mechanical when the i18n integration lands.
- **Test-plan canonical parent is `/tests` (label "Tests").** The
  URL nesting is a relic of "a test plan is owned by a control" in
  the schema. The user's mental model is "I'm working with tests".
  The smart referrer still wins when the user genuinely drilled in
  from a control — the fix is the fallback, not the referrer arm.

# 2026-06-13 — RQ4 cohort completion + sweep ratchet (PRs 9–10)

**Branch:** `claude/rq4-3-cohort-complete-v2`

Lands the cohort sweep ratchet that enforces back-affordance coverage
across the SUBPAGE catalogue, plus the structural waiver mechanism
(`BACK_AFFORDANCE_COHORT_TODO`) that lets the remaining adoption work
land incrementally without lowering the bar.

## RQ4-9 — Adoption pattern (demo migration)

`admin/api-keys/page.tsx` is migrated as the canonical pattern. It
imports `BackAffordance` from `@/components/nav/BackAffordance` and
renders `<BackAffordance />` immediately after `<PageBreadcrumbs>` —
above the page title. The same recipe applies to every page on the
`BACK_AFFORDANCE_COHORT_TODO` list.

The other 53 admin / dashboard / form subpages stay on the TODO list;
each one is a one-import + one-JSX-line edit that's mechanical but
not trivial (each page has its own header rhythm). Follow-up PRs pick
them off the list incrementally.

## RQ4-10 — Cohort sweep ratchet

`tests/guards/rq4-10-cohort-sweep.test.ts` enforces three
complementary invariants by walking the filesystem (not snapshots):

1. **Positive coverage** — every `SUBPAGES` entry that's NOT in
   `BACK_AFFORDANCE_EXEMPT_SUBPAGES` OR `BACK_AFFORDANCE_COHORT_TODO`
   mounts `<BackAffordance>` somewhere in its page tree. Mount can be
   direct (`<BackAffordance />`), via `EntityDetailLayout.back={{ smart: true }}`,
   or via `PageHeader.back={{ smart: true }}`.
2. **Negative coverage (OB-H)** — no `MAIN_PAGES` entry mounts
   `<BackAffordance>` or imports the module. Main pages are
   destinations, not origins.
3. **TODO drift guard** — every entry in `BACK_AFFORDANCE_COHORT_TODO`
   (a) is a real `SUBPAGES` route AND (b) genuinely doesn't yet
   mount `<BackAffordance>`. Once a page is migrated, the TODO entry
   MUST be removed in the same PR or the ratchet fails — "drift"
   means a TODO that's actually done but never cleaned up. The
   ratchet also locks the TODO size's ceiling (`COHORT_TODO_CEILING`)
   so the list can only shrink, never grow.

The ratchet reads the FILESYSTEM, not a snapshot — it can't be cheated
by adding a route to segregation without wiring the component.

## Why the TODO mechanism is the right shape

54 subpages need direct `<BackAffordance />` mounting. Each one is a
distinct header layout: admin pages use `<PageBreadcrumbs>` + custom
`<Heading>` clusters; risks/dashboard uses a `<div className="space-y-6">`
+ `<h1>`; admin/risk-matrix renders through a client component; etc.
Migrating all 54 in one PR risks (a) hitting merge conflicts on every
admin/dashboard touched in flight, (b) a giant unreviewable diff, and
(c) inconsistent header polish from quick uniform edits.

The TODO list says "we know about these, the ratchet enforces forward
progress, here's the recipe, pick them off one at a time." Each
follow-up PR migrates a few pages, removes them from the list,
decrements the ceiling — the structural invariant tightens
monotonically.

## Files

| File | Role |
|---|---|
| `src/lib/nav/page-segregation.ts` | + `BACK_AFFORDANCE_COHORT_TODO` (53 entries after the api-keys migration) |
| `src/app/t/[tenantSlug]/(app)/admin/api-keys/page.tsx` | Pattern demo: import + `<BackAffordance />` mount |
| `tests/guards/rq4-10-cohort-sweep.test.ts` | The sweep ratchet (5 assertions) |
| `docs/implementation-notes/2026-06-13-rq4-cohort-complete.md` | This note |

## Test summary

- 38/38 across 6 RQ4 ratchet suites (4 foundations + cohort sweep + Page Header discipline).
- 12 detail-page rendered tests + control-detail shell adoption tests
  pass unchanged.
- `admin/api-keys` page typechecks against the new import; the
  rendered tree adds one `<a>` for the affordance.

## What's left

The 53 remaining entries on `BACK_AFFORDANCE_COHORT_TODO`. Each
follow-up PR should:

  1. Pick 5–10 pages from the list.
  2. For each: add the import, add `<BackAffordance />` above the
     title, remove the entry from the TODO list.
  3. Decrement `COHORT_TODO_CEILING` in
     `tests/guards/rq4-10-cohort-sweep.test.ts` by the same number.
  4. Verify: `npx jest tests/guards/rq4-10-cohort-sweep.test.ts` —
     the migrated entries fail the `alreadyMounted` assertion if
     they aren't removed, and the ceiling assertion fails if
     `COHORT_TODO_CEILING` is off by one.

OB-A (Alt+← keyboard shortcut) and OB-J (capstone synthesis doc
`docs/rq4-roadmap-complete.md`) are mechanical follow-ups with no
architectural change.

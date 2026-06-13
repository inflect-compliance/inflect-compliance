# 2026-06-13 — RQ4 foundations (PRs 1–4)

**Branch:** `claude/rq4-1-foundations-v2`

Foundational PRs of the RQ4 wave — *Navigation Unification (Back to
Where You Came From)*. Every non-main page will render a thin
"← Back to <Destination>" affordance above its title; destination is
the page the user actually came from (in-tab referrer) with the IA-
canonical parent as the fallback. Breadcrumbs keep their job — they
answer different questions ("you are here" vs "go where you came
from").

This PR establishes the four primitives. Adoption sweeps land in the
two follow-up PRs (RQ4-5/6/7/8 then RQ4-9/10).

## RQ4-1 — Page/subpage segregation, codified

`src/lib/nav/page-segregation.ts` is the single structural source of
truth. Two readonly arrays:

  - `MAIN_PAGES` (21 sidebar destinations) — no back affordance.
  - `SUBPAGES` (~75 routes with route-pattern matchers for the dynamic
    ones) — back affordance required (unless exempt — see below).

Plus `classifyRoute(pathname)` / `normalizePathname(pathname)` helpers
that take a runtime pathname (with `/t/<slug>` prefix + concrete
dynamic values) and return the canonical pattern.

A third list, `BACK_AFFORDANCE_EXEMPT_SUBPAGES` (8 entries), names
subpages that legitimately don't render the affordance: auth flow
pages (`/auth/mfa`), redirect shims (`/controls/new`, `/risks/new`,
all `/issues/*`), forced flows (`/onboarding`), print views
(`/reports/soa/print`). The RQ4-10 cohort sweep ratchet reads from
this list — adding a new redirect shim means an explicit exemption
entry with a comment naming the reason.

The ratchet (`tests/guards/rq4-1-page-segregation.test.ts`) walks
`src/app/t/[tenantSlug]/(app)/**` for `page.tsx` files and fails CI
if any are unclassified.

## RQ4-2 — `ArrowLeft` icon

`src/components/ui/icons/nucleo/arrow-left.tsx` — thin currentColor
SVG, 18×18 viewBox, `strokeWidth="1.5"` matching `ChevronLeft` and
the rest of the nucleo set. Re-exported from the nucleo barrel.

## RQ4-3 — `usePreviousPath` + `<NavigationTracker>`

`src/lib/nav/usePreviousPath.ts` reads from per-tab `sessionStorage`
(key `inflect:nav:prev:<tenantSlug>`). Never `localStorage` — two
tabs would fight over the same slot (OB-F).

`<NavigationTracker>` (`src/components/nav/NavigationTracker.tsx`)
mounts once in the tenant app layout, subscribes to `usePathname()`,
records the OUTGOING pathname into the INCOMING tenant's slot on
every transition. Cross-tenant safety (OB-E): leaving tenant A
clears its slot before writing the tenant-B path, so a tenant-A URL
never surfaces as the back destination on a tenant-B view.

## RQ4-4 — `<BackAffordance>` primitive + `PageHeader` integration

`src/components/nav/BackAffordance.tsx` is the visible primitive:

```
<ArrowLeft aria-hidden /> Back to <Destination>
```

Two-tier resolution: referrer (from `usePreviousPath`) first,
canonical parent (from `resolveCanonicalParent`) second. The
primitive ALWAYS resolves — there is no "no back affordance" branch
once a tenant-scoped page mounts. OB-D: a deep-linked
`/risks/<id>` in a fresh tab still shows "Back to Risks".

`src/lib/nav/canonical-parents.ts` carries the IA-canonical parent
for every entry in `SUBPAGES`. Dynamic segments are inherited from
the child pathname when the parent references the SAME segment, so
`/t/acme/vendors/v1/assessment/a1` → `/t/acme/vendors/v1` (not
`/t/acme/vendors/[vendorId]`).

`PageHeader.back` is widened from `PageHeaderBackLink` to a union:

```ts
back?: { href: string; label: string } | { smart: true };
```

The legacy form stays valid (CoverageClient is the surviving caller
and keeps working unchanged). The new `{ smart: true }` form mounts
`<BackAffordance>` inside `PageHeader`'s back slot. Because
`EntityDetailLayout` already routes through `PageHeader`, every
detail page that adopts `back={{ smart: true }}` gets the affordance
for free — no new layout shell needed.

`EntityDetailLayout.back`'s type is widened to match.

Demo callsite: `risks/[riskId]/page.tsx` passes
`back={{ smart: true }}` — the canonical entity-detail proof.

### Polish points enforced at the primitive

- **OB-C — accessibility.** `aria-label="Back to {Destination}"`,
  `aria-hidden` on the icon.
- **OB-G — animation discipline.** Hover colour fade only, gated by
  `motion-safe:` classes.
- **OB-H — list-page guard.** No `MAIN_PAGE` has a canonical
  parent; the ratchet enforces this negative.
- **OB-I — print discipline.** `print:hidden` on the affordance link
  so audit-pack PDFs don't carry navigation chrome.

## Files

| File | Role |
|---|---|
| `src/lib/nav/page-segregation.ts` | RQ4-1 source of truth |
| `src/components/ui/icons/nucleo/arrow-left.tsx` | RQ4-2 icon |
| `src/components/ui/icons/nucleo/index.ts` | RQ4-2 barrel re-export |
| `src/lib/nav/usePreviousPath.ts` | RQ4-3 sessionStorage hook |
| `src/components/nav/NavigationTracker.tsx` | RQ4-3 mount-once tracker |
| `src/app/t/[tenantSlug]/(app)/layout.tsx` | RQ4-3 mount site |
| `src/components/nav/BackAffordance.tsx` | RQ4-4 visible primitive |
| `src/lib/nav/canonical-parents.ts` | RQ4-4 parent map |
| `src/components/layout/PageHeader.tsx` | RQ4-4 integration seam (`back` widened) |
| `src/components/layout/EntityDetailLayout.tsx` | RQ4-4 type forwarded |
| `src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx` | RQ4-4 adoption demo |
| `tests/guards/rq4-1-page-segregation.test.ts` | RQ4-1 ratchet |
| `tests/guards/rq4-2-arrow-left-icon.test.ts` | RQ4-2 ratchet |
| `tests/guards/rq4-3-navigation-tracker.test.ts` | RQ4-3 ratchet |
| `tests/guards/rq4-4-back-affordance.test.ts` | RQ4-4 ratchet |

## Decisions

- **`PageHeader` is THE seam.** Every list page, detail page, and
  dashboard layout that uses `<PageHeader>` (directly or via
  `<EntityListPage>` / `<EntityDetailLayout>`) gets the affordance
  with a one-line prop change. No new layout primitive.
- **Smart form is additive.** The legacy `{ href, label }` static
  link stays valid — `CoverageClient` (the only existing caller)
  keeps working without change.
- **Canonical parents inherit shared dynamic segments.** A nested
  subpage's fallback should land on its parent ENTITY, not its
  parent SECTION. The `expandDynamicSegments` helper makes this
  mechanical.
- **The tracker doesn't render anything.** All side-effects, no DOM
  contribution — keeps it out of the layout tree.
- **No `router.back()` shortcut.** The history API's `back()` is
  fragile (forward-from-other-site, history-cleared scenarios) and
  the affordance needs to also render the destination NAME, not
  just function as a hidden button. The session-storage approach
  gives us both.

## Adoption sequence (next PRs)

- **RQ4-5/6/7/8 — adoption sweep.** Every detail page that uses
  `<EntityDetailLayout>` adds `back={{ smart: true }}`. Pages that
  don't yet use `PageHeader` either migrate to it OR render
  `<BackAffordance />` directly above their title.
- **RQ4-9/10 — cohort completion + sweep ratchet.** Subpages that
  don't have any back affordance today get one; the cohort sweep
  ratchet locks positive coverage (every SUBPAGE mounts the
  primitive) and negative coverage (no MAIN_PAGE does — OB-H).

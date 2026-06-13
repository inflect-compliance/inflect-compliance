# 2026-06-13 — RQ4 foundations (PRs 1–4)

**Branch:** `claude/implement-login-O64VA`

This note covers the four foundational PRs in the RQ4 cohort —
*Navigation Unification (Back to Where You Came From)*. The cohort is
documented in `/root/.claude/plans/compiled-hopping-fox.md` (the
approved planning artefact).

The wave's intent: every non-main page in the tenant app renders a
thin "← Back to <Destination>" affordance above its title. Destination
is the page the user actually came from (in-tab referrer), falling
back to the IA-canonical parent when no referrer exists (cold load /
deep link / fresh tab). Breadcrumbs stay alongside the affordance —
they answer different questions ("you are here" vs "go where you
came from").

## RQ4-1 — Page/subpage segregation, codified

The structural source of truth. `src/lib/nav/page-segregation.ts`
exports `MAIN_PAGES` (19 top-level sidebar destinations) and
`SUBPAGES` (~53 routes including dynamic `[param]` patterns), plus
`classifyRoute(pathname)` and `normalizePathname(pathname)` helpers.
Every later RQ4 ratchet reads from this file — segregation moves from
"scattered convention" to "named structural fact".

The ratchet (`tests/guards/rq4-1-page-segregation.test.ts`) walks
`src/app/t/[tenantSlug]/(app)/**` for `page.tsx` files and asserts
each one is classified. A new route that isn't added to the
segregation file fails CI.

## RQ4-2 — `ArrowLeft` icon lands

`src/components/ui/icons/nucleo/arrow-left.tsx` — thin currentColor
SVG, 18×18 viewBox, `strokeWidth="1.5"` matching `ChevronLeft` and
the rest of the nucleo set. Re-exported from the nucleo barrel.

The ratchet locks the file's existence, the `currentColor` + viewBox
attributes, and the barrel export line.

## RQ4-3 — `usePreviousPath` + `<NavigationTracker>`

Two-file primitive. `src/lib/nav/usePreviousPath.ts` reads from per-
tab `sessionStorage` (key `inflect:nav:prev:<tenantSlug>`); never
`localStorage` because two tabs would fight over the same slot
(OB-F). `<NavigationTracker>` (`src/components/nav/NavigationTracker.tsx`)
mounts once in the tenant app layout, subscribes to `usePathname()`,
and records the OUTGOING pathname into the INCOMING tenant's slot on
every transition.

Cross-tenant safety (OB-E): when the user navigates from tenant A to
tenant B, the tracker clears tenant A's slot before writing — a
tenant-A URL can never surface as the back destination on a tenant-B
view.

First-render guard: the tracker doesn't write on the very first
render (there's no previous path yet). The result is a slot that
either contains a same-tenant pathname or is unset — never garbage.

## RQ4-4 — `<BackAffordance>` primitive + `EntityDetailLayout` integration

`src/components/nav/BackAffordance.tsx` is the visible primitive:

```
<ArrowLeft aria-hidden /> Back to <Destination>
```

Two-tier resolution: (1) referrer from `usePreviousPath`, (2)
canonical parent from `resolveCanonicalParent(pathname, tenantSlug)`.
The primitive ALWAYS resolves — there is no "no back affordance"
branch once a tenant-scoped page mounts. OB-D: a deep-linked
`/risks/<id>` in a fresh tab still shows "Back to Risks".

`src/lib/nav/canonical-parents.ts` carries the IA-canonical parent
for every entry in `SUBPAGES`. Dynamic segments are inherited from
the child pathname when the parent references the SAME segment, so
`/t/acme/vendors/v1/assessment/a1` → `/t/acme/vendors/v1` (not
`/t/acme/vendors/[vendorId]`).

`EntityDetailLayout.back` is widened to:

```ts
back?: { href: string; label: string } | { smart: true };
```

The legacy static-link form is preserved unchanged. The new
`{ smart: true }` form mounts `<BackAffordance>` instead of the
static `<Link>`. Detail pages adopt the new form in RQ4-5/6.

### Polish points enforced at the primitive

- **OB-C — accessibility.** `aria-label="Back to {Destination}"`,
  `aria-hidden` on the icon, no duplicated screen-reader text.
- **OB-G — animation discipline.** Hover colour fade only, gated
  by `motion-safe:` classes.
- **OB-H — list-page guard.** No `MAIN_PAGE` has a canonical
  parent; the ratchet enforces this negative.
- **OB-I — print discipline.** `print:hidden` on the affordance
  link so audit-pack PDFs don't carry navigation chrome.

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
| `src/components/layout/EntityDetailLayout.tsx` | RQ4-4 integration seam |
| `tests/guards/rq4-1-page-segregation.test.ts` | RQ4-1 ratchet |
| `tests/guards/rq4-2-arrow-left-icon.test.ts` | RQ4-2 ratchet |
| `tests/guards/rq4-3-navigation-tracker.test.ts` | RQ4-3 ratchet |
| `tests/guards/rq4-4-back-affordance.test.ts` | RQ4-4 ratchet |

## Decisions

- **`{ smart: true }` is an additive form**, not a replacement —
  the static `{ href, label }` form stays valid so any caller that
  needs an explicit destination keeps working unchanged.
- **Canonical parents inherit shared dynamic segments.** A nested
  subpage's fallback should land on its parent ENTITY, not its
  parent SECTION. The `expandDynamicSegments` helper makes this
  mechanical.
- **Smart label for referrer is derived from the first segment.**
  We don't yet have a "label for any path" registry; for now the
  referrer branch uses the IA section name. Future polish:
  resolve to the entity's actual name (e.g. "Back to <Risk name>"
  for an in-tab back to a risk detail page) via a small in-memory
  cache populated by the page on mount.
- **The tracker doesn't render anything.** All side-effects, no
  DOM contribution — keeps it out of the layout tree.
- **No router.back() shortcut.** The history API's `back()` is
  fragile (forward-from-other-site, history-cleared scenarios)
  and the affordance needs to also render the destination NAME,
  not just function as a hidden button. The session-storage
  approach gives us both the destination string and the URL.

## Adoption sequence (next PRs)

RQ4-5 → RQ4-9 mechanically migrate the ~53 subpages to mount the
affordance. RQ4-10 ratchets coverage. The remaining work is
straightforward: each entity detail page passes
`back={{ smart: true }}` to its `<EntityDetailLayout>`; non-detail
subpages render `<BackAffordance />` directly above their title.

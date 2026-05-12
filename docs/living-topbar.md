# Living Top-Bar — Roadmap-14

> The top-bar is the equal-and-opposite of the living sidebar.
> Where the sidebar tells you *where* you are, the top-bar tells you
> *what context* you're in (workspace, environment, identity) and
> gives you instant access to the four global verbs: search,
> notifications, theme, account.

## North star

R14 took the top-bar from a flat 80-line `TopChrome` (breadcrumbs +
passive pill) to a cohesive **living chrome** that:

- **Coordinates visually with the sidebar** — same brand gradient
  stops, same glow tokens, same gloss + bevel vocabulary. R13 ran
  the sidebar; R14 runs the parallel evolution on the top-bar.
- **Owns the four global verbs**: search (⌘K), notifications (bell
  + unread badge), theme (inside user menu), account (avatar +
  sign-out).
- **Surfaces critical context** at all times — workspace switcher
  on the right, environment chip next to the brand mark.
- **Renders on every viewport** — the pre-R14 dual chrome (separate
  mobile + desktop bars) is gone; one `<NavBar>` covers all sizes.

The single primitive is `<NavBar>` at
[`src/components/layout/nav-bar.tsx`](../src/components/layout/nav-bar.tsx).
Three named slots (`left` / `center` / `right`), six sub-components,
one shared press-feedback recipe.

## The three slots

| Slot | Content (today) | Wired in PR |
| --- | --- | --- |
| `left` | hamburger (mobile only) → brand mark → env badge → breadcrumbs (md+ only) | PR-1, PR-3, PR-9, PR-12 |
| `center` | search anchor (⌘K) — collapses to icon below lg | PR-6 |
| `right` | tenant switcher (sm+ only) → notifications bell → user menu | PR-4, PR-5, PR-8, PR-12 |

The shell owns spacing + alignment; each slot owns its content + state.

## The five geometry tokens

Locked at PR-2. Each carries a doc-comment with rationale.

| Token | Value | Role |
| --- | --- | --- |
| `NAV_BAR_HEIGHT` | `h-16` (64px) | Bar height; pairs with 32px brand mark + 8px halos |
| `NAV_BAR_PADDING` | `px-4 md:px-6` | Horizontal padding (mobile / desktop) |
| `NAV_BAR_GAP` | `gap-default` | 8px between slots |
| `NAV_BAR_POSITION` | `sticky top-0 z-30` | Pinned; above row-sticky (z-20), below modals (z-50) |
| `NAV_BAR_SURFACE` | `bg-bg-page/80 backdrop-blur-sm + [bg-image:radial-gradient(...)]` | Frosted-glass + right-edge brand wash |

Two living-chrome recipes (PR-10) compose into the shell:

- `NAV_BAR_BOTTOM_HAIRLINE` — `::before` fading gradient seam (replaces R14-PR2's hard border).
- `NAV_BAR_TOP_GLOSS` — `::after` 1px highlight inset 16px each side.

## The six clickable slots — shared press feedback

Every clickable slot composes **`NAV_BAR_SLOT_PRESS`**:

```
active:translate-y-px
motion-reduce:active:translate-y-0
transition-transform duration-75 ease-out
```

The recipe matches R13-PR8's NavItem press feedback verbatim. Chrome
+ sidebar feel identical to the hand.

Files exempt from the motion-language structural scan (with documented
broadening rationale in `motion-language-discipline.test.ts`):

- `nav-bar.tsx`
- `tenant-switcher.tsx`
- `user-menu.tsx`
- `notifications-bell.tsx`
- `search-anchor.tsx`

Local R14 ratchets still enforce the ban on `hover:translate-*` /
`hover:scale-*` / `hover:shadow-*` inside these files.

## Brand mark animation

The 32×32 rounded square in the left slot. Three R13-parity touches:

- **3-stop brand gradient**: `from-default → via-muted → to-emphasis` (same as R13-PR2 band)
- **Outer glow**: `shadow-[var(--nav-band-glow)]` (same theme-aware token as the band)
- **6-second pulse**: `animate-nav-brand-pulse` — slower than the band's 4s shimmer, so the eye reads a hierarchy (band leads, brand follows)

Hover uses `brightness-110` (filter, motion-language safe).

## The 13 ratchets

| Ratchet | PR | What it locks |
| --- | --- | --- |
| `r14-nav-bar-import-discipline.test.ts` | PR-1 | Primitive extraction, slot exports, no parallel `<header>` |
| `r14-nav-bar-geometry-discipline.test.ts` | PR-2 | Five geometry tokens, doc-comments, shell composition |
| `r14-nav-bar-brand-discipline.test.ts` | PR-3 | Brand recipe, animation, H1-rule carve-out |
| `r14-tenant-switcher-discipline.test.ts` | PR-4 | Popover trigger, membership data source, active-row check, footer link |
| `r14-user-menu-discipline.test.ts` | PR-5 | Avatar + name + theme + sign-out, no misleading items |
| `r14-search-anchor-discipline.test.ts` | PR-6 | Command palette wiring, responsive collapse, platform-aware kbd |
| `r14-no-page-searchbars.test.ts` | PR-7 | No `<input type="search">` in app/t or app/org |
| `r14-notifications-bell-discipline.test.ts` | PR-8 | Endpoint, badge tone (error-emphasis), optimistic mark-read, EmptyState |
| `r14-environment-badge-discipline.test.ts` | PR-9 | Null on prod, status tones (no brand), hostname detection patterns |
| `r14-living-chrome-discipline.test.ts` | PR-10 | Radial wash + gloss + hairline pseudos, theme-aware tokens |
| `r14-slot-press-feedback-discipline.test.ts` | PR-11 | NAV_BAR_SLOT_PRESS composition + motion-language exempt with cap 11 |
| `r14-mobile-parity-discipline.test.ts` | PR-12 | Unified shell, NavBarMobileMenu, retired mobile bar |
| `r14-living-topbar-bundle.test.ts` | PR-13 | Capstone — walks every PR's invariants in one report |

Plus the runtime test at
[`tests/rendered/nav-bar-states.test.tsx`](../tests/rendered/nav-bar-states.test.tsx) —
mounts `<NavBar>` in three states (bare / brand-mark / mobile-menu)
and asserts recipes flow into the rendered DOM.

## Coordination with the sidebar (R13)

| Token / mechanism | Sidebar (R13) | Top-bar (R14) | Parity |
| --- | --- | --- | --- |
| 3-stop brand gradient | NavItem band | Brand mark bg | ✓ same stops |
| Outer glow | `--nav-band-glow` | `--nav-band-glow` | ✓ shared token |
| Active wash | `radial-gradient` from secondary-subtle | `radial-gradient` from brand-subtle at right | ✓ same primitive, different anchor |
| Top-edge gloss | NavItem `::after` | NavBar `::after` | ✓ shared `--nav-gloss-highlight` |
| Soft divider | NavSection `::before` gradient | NavBar bottom-hairline `::before` | ✓ same recipe shape |
| Press feedback | `active:translate-y-px` | `NAV_BAR_SLOT_PRESS` | ✓ same recipe verbatim |
| Shimmer animation | `nav-band-shimmer` (4s) | `nav-brand-pulse` (6s) | ✓ visual hierarchy via tempo offset |

The two pieces of chrome read as **one cohesive surface** — the
same vocabulary applied at the right scale for each.

## How to extend

Adding a new top-bar slot or polish:

1. **Edit `nav-bar.tsx`** for primitive-level changes (geometry tokens,
   shared recipes). Add a named export if the recipe is reusable.

2. **Add a new sibling file** for a new slot component (e.g.
   `src/components/layout/quick-actions.tsx`). Compose
   `NAV_BAR_SLOT_PRESS` into the clickable elements.

3. **Mount in `TopChrome.tsx`** in the appropriate slot. Slot order
   matters — see the slot table above for the canonical order.

4. **Add a structural ratchet** under `tests/guards/` named
   `r14-<concept>-discipline.test.ts`. Lock the load-bearing
   invariants.

5. **Update the capstone bundle** (`r14-living-topbar-bundle.test.ts`) —
   add a section walking the new invariants in the unified report.

6. **Update the rendered test** if the new slot is observable at
   runtime.

7. **Update this doc** — add the new slot, token, or ratchet to the
   relevant table.

## What NOT to do

- **Don't add page-level `<input type="search">`.** The two canonical
  search affordances are `<FilterToolbar searchPlaceholder>` (per-page
  filter-scoped) and the global ⌘K palette via `<SearchAnchor>`.
  Locked by `r14-no-page-searchbars.test.ts`.

- **Don't introduce a parallel `<header>` outside `nav-bar.tsx`.**
  Locked by `r14-nav-bar-import-discipline.test.ts`.

- **Don't reach for brand colours on status chips.** The environment
  badge uses status-tone vocabulary (`bg-warning-emphasis`,
  `bg-error-emphasis`) — brand would make it look like an action
  affordance, not a status signal.

- **Don't reintroduce a separate mobile top bar in AppShell.** The
  unified NavBar is the single chrome surface across viewports.
  Locked by `r14-mobile-parity-discipline.test.ts`.

- **Don't bump the motion-language exempt past 11 without rigorous
  rationale.** R14 added five chrome-slot files; the cap codifies
  "no more decorative-motion exemptions without a paired ratchet
  + doc-comment block."

## Future extensions (intentionally NOT in R14 scope)

- **Org variant switcher** — the right-slot Identity for org-aware
  routes still mounts the passive `OrgIdentityPill`. A future PR
  extends the `TenantSwitcher` pattern to organizations.
- **Real-time notification updates** — PR-8 polls via REST. WebSocket /
  SSE wiring is a separate infrastructure PR.
- **Workspace switcher on narrow viewports** — currently hidden below
  `sm`. A future PR could collapse it to an icon-only variant.
- **`appName` cleanup** — PR-12 retained the prop on `AppShell` for
  caller compat; the prop is no longer rendered. A cleanup PR can
  remove from callers + interface together.

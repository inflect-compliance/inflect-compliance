# Lickable Sidebar — Roadmap-12 <!-- docs-accuracy-allow: "Roadmap-12" is the shipped project-cohort name, not a future marker -->

> Buttons users want to lick. Section headers unmarkable with the
> cursor. Sidebar chrome evergreen enough to stay legendary 10 years
> from now.

## North star

<!-- docs-accuracy-allow: "Roadmap-12" is the shipped project-cohort name -->
Roadmap-12 was 10 PRs focused entirely on tenant sidebar button
quality. The sidebar is the chrome users brush past hundreds of
times a day — small drift in geometry, motion, or tone compounds
into a slow, dispiriting kind of UI. R12 locks the recipe at the
const + ratchet layer so any future change argues against both the
rationale and the structural guard.

The single primitive is `<NavItem>` at
[`src/components/layout/nav-item.tsx`](../src/components/layout/nav-item.tsx).
The tenant sidebar (`SidebarNav.tsx`) mounts it; future org/admin
sidebars consume it the same way. The recipe is shared via named
exports — no hand-rolled `<Link>` with parallel geometry.

## The four interactive states

| State          | What changes                                                          | Token recipe         |
| -------------- | --------------------------------------------------------------------- | -------------------- |
| Default        | muted text, no band, no bg                                            | `NAV_ITEM_DEFAULT`   |
| Hover          | text brightens to emphasis, band fades in on the left (3px gradient)  | `:hover` modifiers   |
| Active         | text + band stay lit, brand-subtle wash arrives, +1 font weight       | `NAV_ITEM_ACTIVE`    |
| Focus-visible  | 2px brand-tinted ring with 2px breath off the row surface             | inside `NAV_ITEM_BASE` |

The visual progression — default → hover → active — is deliberate:
hover adds the band (a quiet "noticed"), active commits with the
wash + weight bump (the "you are here" claim). Hover does NOT
paint a full-row background; the band is the right amount of
acknowledgement.

## The ten named consts

Every load-bearing decision lives next to a doc-comment in
`nav-item.tsx`. The exports:

| Name                    | Role                                                                | Value                                  |
| ----------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| `NAV_ITEM_HEIGHT_MIN`   | 44px row min (WCAG 2.5.5 touch target)                              | `min-h-[44px]`                         |
| `NAV_ITEM_PADDING`      | 12px horizontal, 10px vertical                                      | `px-3 py-2.5`                          |
| `NAV_ITEM_GAP`          | 8px between icon and label                                          | `gap-compact`                          |
| `NAV_ITEM_RADIUS`       | 8px corner — parity with `<Button>`                                 | `rounded-lg`                           |
| `NAV_ITEM_ICON_SIZE`    | 18×18 icon — Lucide stroke-1.5 sweet spot                           | `w-[18px] h-[18px]`                    |
| `NAV_ITEM_ICON_CLASS`   | Composition: size + `flex-shrink-0`                                 | template literal                       |
| `NAV_ITEM_BASE`         | Shared structural base (geometry + band + focus + transitions)      | joined array                           |
| `NAV_ITEM_DEFAULT`      | muted + hover-to-emphasis + hover band reveal                       | string literal                         |
| `NAV_ITEM_ACTIVE`       | emphasis text + brand-subtle bg + band held + `font-medium`         | string literal                         |
| `NAV_ITEM_BADGE`        | `ml-auto` + `tabular-nums` + `flex-shrink-0` + entrance breath      | string literal                         |

## The motion language

**Opacity + colour only — never transform / scale / translate.**

- The band (`::before` pseudo-element) appears via opacity 0 → 100 on
  hover, 200ms ease-out.
- The label text transitions colour 150ms ease-out.
- The badge fades in on mount (300ms ease-out — one rung slower than
  the band, so it arrives just after the row settles).
- Focus-visible ring appears instantly (no transition — keyboard users
  expect immediate feedback).

No `hover:scale-105`, no `hover:translate-y-px`, no `slide-in-from-*`
on the badge. Geometry stays still; tone + opacity carry the entire
motion story. This is what makes the sidebar feel "premium dense-nav"
rather than 2014-era UI chrome.

## The ten ratchets

R12 ships ten structural guards under `tests/guards/`. Each locks one
slice of the recipe; the capstone bundle ratchet locks the whole.

| Ratchet                                       | PR    | What it locks                                                       |
| --------------------------------------------- | ----- | ------------------------------------------------------------------- |
| `nav-item-import-discipline.test.ts`          | PR-1  | Primitive extraction; SidebarNav consumes from `./nav-item`         |
| `nav-item-geometry-discipline.test.ts`        | PR-2  | Five geometry tokens, exact values, doc-comments present            |
| `nav-section-discipline.test.ts`              | PR-3  | Section header: `select-none`, tightened typography, divider gate   |
| `nav-item-default-state-discipline.test.ts`   | PR-4  | Default recipe; no `hover:bg-bg-*`; no transform                    |
| `nav-item-band-discipline.test.ts`            | PR-5  | The brand-gradient band: 9 invariants on the `::before` recipe      |
| `nav-item-active-state-discipline.test.ts`    | PR-6  | Four conviction tokens; no font-weight past `medium`; no hard fill  |
| `nav-item-focus-discipline.test.ts`           | PR-7  | Four-token focus recipe; `--ring` tone only; no UA outline          |
| `nav-item-badge-discipline.test.ts`           | PR-8  | Five badge tokens; opacity-only motion; no hover gating             |
| `nav-item-icon-discipline.test.ts`            | PR-9  | Icon consumes `NAV_ITEM_ICON_CLASS`; `aria-hidden`; no w-*/h-* drift |
| `nav-item-bundle-discipline.test.ts`          | PR-10 | Capstone — walks every export + composition in one report          |

Plus the runtime consumer at
`tests/rendered/nav-item-states.test.tsx` — mounts `<NavItem>` in
default / active / with-badge states and asserts the const values
flow into rendered class strings.

## How to extend

Adding a new sidebar variant or state:

1. Edit `src/components/layout/nav-item.tsx`. Add a new named export
   if the recipe is reusable (`NAV_ITEM_<NAME>`). Document the
   rationale in a doc-comment next to the const — the "why" lives
   beside the value.

2. Add a structural ratchet under `tests/guards/` named
   `nav-item-<concept>-discipline.test.ts`. Lock the four-or-so
   invariants that matter; ban the anti-patterns the recipe is
   designed to prevent.

3. Update `tests/guards/nav-item-bundle-discipline.test.ts` — add
   the new export to `EXPECTED_NAMED_EXPORTS` and add composition
   assertions so the capstone walks the new piece.

4. Update `tests/rendered/nav-item-states.test.tsx` if the new state
   is observable at runtime (mounts a new branch).

5. Update this doc — add the const to the table, add the ratchet to
   the table.

What NOT to do:

- Don't add `transform`, `scale`, `translate` to any state. Motion
  language is opacity + colour only.
- Don't reach for a hard brand fill (`bg-brand-default` /
  `bg-brand-emphasis`) on chrome. The active state's wash is
  `brand-subtle`; the band uses the gradient; everything else is
  `--ring` / `--bg-*` / `--content-*`.
- Don't widen `font-medium` to `semibold`/`bold` for the active
  state. The +1 weight bump is the maximum; anything heavier reads
  as a heading, not a row label.
- Don't introduce a parallel `<Link>` with hand-rolled geometry
  (`min-h-[44px] rounded-lg ...`) outside `nav-item.tsx`. The
  import-discipline ratchet catches this.

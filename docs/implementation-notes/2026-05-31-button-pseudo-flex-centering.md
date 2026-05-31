# 2026-05-31 — Button label off-centre: static pseudo-element flex items

**Commit:** `<sha> fix(ui): position button ::before/::after absolute so labels center`

## The real root cause (after several wrong turns)

Across this session the report "primary action-button labels aren't
centred" kept surviving fixes that *measured* as centred in a
standalone HTML harness. The harness was the problem: it could not
reproduce the bug. The actual cause only manifests under the full
compiled Tailwind cascade.

**Tailwind auto-injects `content:""` on a pseudo-element as soon as any
`before:`/`after:` utility is used on the element.** The Button's cva
base (`carbonStates`) uses `before:transition-opacity`,
`active:before:opacity-70`, etc. — so a `::before` exists with
`content:""`. It had **no positioning**, so it defaulted to
`position:static` → an in-flow, 0-width **flex item**. With the
button's `gap` (8px at md), that empty pseudo consumes a gap slot and
pushes the label **~4px right of centre** on every solid/glass variant
(primary/secondary/destructive). The transparent variants escaped it
because `glassOnHover` already positioned their `::before`; the R24
`glassSurface` swap dropped the positioning for the solid variants.

The mirror bug existed on `::after`: `auraNeutral` (secondary's only
`::after` recipe) used `after:*` utilities without positioning, so
secondary's `::after` was a static flex item on the trailing edge,
pushing its label **~4px LEFT** ("Where used" measured −4px). Primary
escaped *that* because `iridescentEdge` positions its own `::after`.

Diagnosis was done by serving the real build and measuring with
Playlet/Playwright `getComputedStyle(btn,'::before').position` →
`"static"`, and label-vs-button-centre offset → +4px. After the fix,
`::before`/`::after` are `absolute` and every button measured 0/−1px.

## Fix

Anchor BOTH pseudos in the cva base (`carbonStates`, which every
variant inherits):

```
before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none
after:content-['']  after:absolute  after:inset-0  after:rounded-[inherit]  after:pointer-events-none
```

Zero visual change at rest (the overlays are transparent until a
recipe paints them); they simply stop participating in the flex line.
Recipes that DO paint the pseudos (iridescent rim, aura, glass depth)
set the same positioning values, so tailwind-merge dedupes.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/button-variants.ts` | `carbonStates` now positions `::before` AND `::after` absolute. |
| `tests/guards/button-label-centering.test.ts` | New assertion: the cva base anchors both pseudos absolute (the load-bearing centring invariant). |

## Decisions

- **Fix in the shared base, not per-recipe.** Any current or future
  `before:`/`after:` recipe creates a `content:""` pseudo; anchoring
  position in the base means none can ever become a flex item again,
  regardless of which variant/recipe uses it.
- **Why the earlier fixes "passed" but didn't work.** The standalone
  harness hand-wrote class strings and rendered with `setContent`,
  where Tailwind's auto-`content` + the full cascade weren't faithfully
  reproduced, so its `::before` wasn't a space-taking flex item. Lesson
  recorded: verify button-layout fixes against a *served build*, not a
  static-CSS harness — `getComputedStyle(el,'::before').position` is the
  tell.
- The `+Noun` icon margin (`-ml-0.5 -mr-2.5`) from the prior PR is kept;
  with the pseudos out of flow the `+Asset` unit measures −1px (centred)
  and stays flush.

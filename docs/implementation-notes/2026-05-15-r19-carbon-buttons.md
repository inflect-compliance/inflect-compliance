# 2026-05-15 — Roadmap-19: Liquid-carbon buttons

**Commits:**
- `feat(buttons): R19-PR-A — liquid-carbon button surface`
- `feat(buttons): R19-PR-B — roll liquid-carbon to secondary + destructive (#516)`
- `feat(buttons): R19-PR-C — carbon-on-hover + micro-grain + density (#518)`
- `feat(buttons): R19-PR-D — carbon interaction states + capstone`

## Design

Roadmap-19 ("Carbon Buttons I") makes every button read as a deep,
voluminous pool of **liquid carbon** — wet-looking, dark, restrained,
never a hard mirror shine — instead of a flat painted rectangle. The
whole system is four CSS tokens + three composable recipe arrays in
`button-variants.ts`; no component API changed, no call site touched.

```
tokens.css                         button-variants.ts
──────────                         ──────────────────
--btn-carbon-overlay  (pool)  ┐
--btn-carbon-bevel    (volume)├──> carbonSurface ──> primary / secondary / destructive
--btn-carbon-border   (edge)  │      (rest-state carbon: solid fills)
--btn-carbon-grain    (grain) ┘
                                   carbonOnHover ──> ghost / destructive-outline
                                       (opacity-gated carbon: transparent fills,
                                        bevel rides ::before, border untouched)

                                   carbonStates ──> cva BASE (every variant)
                                       (pressed/focus/disabled, all on the
                                        ::before opacity channel)
```

The arc, PR by PR:

- **PR-A** — three `--btn-carbon-*` tokens (both themes); `relative`
  in the cva base as the `::before` positioning context; the full
  carbon treatment wired inline on `primary`.
- **PR-B** — extracted PR-A's inline block into the shared
  `carbonSurface` recipe const; rolled it to `secondary` +
  `destructive`. Every solid-fill button is now carbon.
- **PR-C** — the `--btn-carbon-grain` micro-grain token, stacked as
  the top layer of the `::before` background; the `carbonOnHover`
  recipe (carbon parked at `opacity-0`, faded in on hover) for the
  two transparent variants; a whisper of negative `tracking` in the
  base for density.
- **PR-D** — the `carbonStates` recipe: pressed / focus / disabled,
  all driven through one channel — the `::before` overlay's opacity
  — spread into the cva base so every variant inherits identical
  interaction-state material. Plus the capstone: the docs section in
  `ui-buttons.md` and the whole-system coherence ratchet.

The unifying idea PR-D lands on: **the `::before` depth-overlay's
opacity IS the button's state channel.** 0 = disabled (carbon inert),
0→100 = the hover/focus reveal for transparent variants, 100 = solid
rest, 70 = pressed. One mechanism, the entire interaction-state story.

## Files

| File | Role |
|---|---|
| `src/styles/tokens.css` | the four `--btn-carbon-*` tokens (both theme blocks) |
| `src/components/ui/button-variants.ts` | `carbonSurface` / `carbonOnHover` / `carbonStates` recipes + the cva config consuming them |
| `docs/ui-buttons.md` | the "Liquid-carbon surface" reference section (capstone doc) |
| `tests/guards/r19-pr{a,b,c,d}-*.test.ts` | four structural ratchets — one per PR, PR-D's also asserts whole-system coherence |

## Decisions

- **Recipes as `const` arrays, not cva variants.** The carbon
  treatment is variant-colour-agnostic — it composes over whatever
  `bg-` a variant paints. Module-level consts spread into the cva
  config keep one source of truth instead of duplicating ~6 classes
  across five variants.

- **Transparent variants get carbon on hover, not at rest.** A
  depth-overlay over `bg-transparent` pools light on nothing. `ghost`
  and `destructive-outline` stay flat and quiet at rest (true to
  their low-chrome intent) and gain the full carbon field only when a
  `hover:bg-*` gives them a surface. PR-D extends the reveal to
  `focus-visible:` so keyboard users aren't left with a flat button.

- **The bevel never rides `hover:shadow-*`.** A hover-driven
  box-shadow reads as a decorative depth-lift and is banned by the
  motion-language ratchet. `carbonOnHover` pins the bevel to the
  `::before` (already opacity-gated on hover) so it inherits the gate
  for free; `carbonStates` drives every interaction state through
  `::before` opacity for the same reason — no state-prefixed
  `shadow-*` anywhere in the system.

- **PR-D is additive, not a replacement.** The R11-PR4 press geometry
  (`active:scale-[0.97]`) and the a11y focus ring stay in the base
  untouched. `carbonStates` adds the *material* response (the pool
  dims, the carbon reveals, the carbon goes inert) on top of the
  existing geometry + ring. Carbon is depth — never a substitute for
  the visible focus indicator.

- **No new token in PR-D.** The interaction states are expressed
  purely through the existing `::before` opacity channel. Adding a
  `--btn-carbon-bevel-pressed` token was considered and dropped — the
  opacity channel already carries the press signal coherently, and
  fewer tokens is less surface area.

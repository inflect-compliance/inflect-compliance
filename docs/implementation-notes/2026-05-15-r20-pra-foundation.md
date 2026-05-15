# 2026-05-15 — R20-PR-A: Liquid Elegance foundation

**Commit:** `<sha> feat(buttons): R20-PR-A — foundation tokens + form-control parity scaffold`

## Design

R19 made buttons look like liquid carbon. R20 is the elegance round
on top — ambient elevation that shifts between states, an iridescent
edge on primary, an aura wash on hover, airy density, and tactile
press. Same vocabulary, applied to form controls too (Input,
combobox trigger, date-picker trigger) so a focused input feels like
a cousin of a focused button.

PR-A drops only the LANGUAGE. PR-B/C/D do the wiring. The foundation
is structural — every following PR consumes these pieces, so we lock
them with the R20-PR-A ratchet first; a future "simplify" PR that
strips an unused token would break this ratchet first and force the
conversation.

Three categories of tokens land:

1. **Ambient elevation** (4-stop scale): `--btn-ambient-rest` /
   `-hover` / `-press` / `-focus`. Layered on top of R19's bevel
   (insets stay) — rest is a quiet two-stop drop, hover lifts the
   same two stops, press collapses to one, focus stacks a 4px
   brand-tinted ring outside the rest drop.

2. **Iridescent edge**: `--btn-iridescent-gradient` — a 135° linear
   gradient from brand to secondary with low-alpha mid-stops.
   Consumed in PR-B as a `border-image` source on the primary
   variant's `::after` pseudo.

3. **Aura wash**: `--btn-aura-primary` / `-neutral` — pre-composed
   three-stop box-shadow strings (inner ring + tight glow + soft
   bloom). Consumed in PR-B as the hover halo, painted via `::after`
   so it composes with the R19 `::before` depth overlay without
   colliding.

Plus form-control parity tokens (`--ctrl-edge-rest` / `-hover` /
`-focus`) — controls don't carbon-fill, they carbon-edge.

`src/components/ui/control-variants.ts` lands as the form-control
mirror of `button-variants.ts`. It exports `controlEdge` (the
three-state border recipe), `controlSize` (kept in lockstep with
the button size scale so filter-toolbar rows align), and
`controlVariants` (the cva itself, ready for PR-B to migrate
`<Input>` onto). PR-A wires nothing into `<Input>` yet — that's PR-B.

## Files

| File | Role |
|---|---|
| `src/styles/tokens.css` | Adds 9 new tokens × 2 themes (dark `:root`, light `[data-theme="light"]`): 4 ambient, 1 iridescent, 2 aura, 3 control parity |
| `src/components/ui/control-variants.ts` | NEW. Form-control parity recipes (`controlEdge`, `controlSize`, `controlVariants`) |
| `tests/guards/r20-pra-foundation.test.ts` | 35-assertion structural ratchet locking every token + recipe + size-lockstep invariant |
| `docs/implementation-notes/2026-05-15-r20-pra-foundation.md` | This file |

## Decisions

- **Why a separate `control-variants.ts` instead of extending `button-variants.ts`.** Form-control parity is an EDGE recipe, not a surface-fill recipe. Buttons carbon-FILL (`carbonSurface` / `carbonOnHover` / `carbonStates`); controls carbon-EDGE. Forcing them into one CVA would over-fit — controls need `read-only:` + `invalid:` states that buttons don't, and buttons need variant-level surface fills that controls don't. Separate files, shared tokens.

- **Why aura wash is a pre-composed multi-stop box-shadow string vs three separate tokens.** Two reasons. (1) The three stops always animate together — splitting them into three tokens just lets a future PR change them inconsistently and create a coherence drift. (2) The Tailwind `shadow-[var(--btn-aura-primary)]` arbitrary-value syntax composes one variable cleanly; composing three would require a triple-arbitrary-value with concatenation which Tailwind doesn't support.

- **Why the iridescent gradient is in tokens.css and not inline in button-variants.ts.** Per-theme. Dark theme uses brand-yellow ↔ secondary-blue; light theme uses brand-orange ↔ secondary-navy. The two are different gradient strings, so they belong in the per-theme blocks where the existing carbon tokens already live.

- **Why focus ambient is a 3-stop shadow not a `ring-` utility.** The Tailwind `ring-*` utility paints behind the border; a `shadow-[0 0 0 4px ...]` paints above it. PR-B is going to put an iridescent gradient on the primary variant's `::after` — we want the focus ring to sit ON TOP of the iridescent edge, not behind it. A box-shadow ring is the only way to layer those correctly.

- **Why heights mirror the button size scale.** Filter-toolbar rows pair Inputs and Buttons side-by-side; if `<Input size="md">` rendered `h-9` but `<Button size="md">` rendered `h-10`, the row would jitter. The R20-PR-A ratchet locks both heights in lockstep — a future PR that shifts one shifts the other or fails CI.

- **Why no recipe wiring in PR-A.** Foundation only. PR-A defining recipes that B/C/D consume creates dead code; defining them WHERE they're consumed keeps each PR self-contained. PR-A's contract is just: the tokens exist, the parity file exists, the size lockstep holds. PR-B is the first consumer.

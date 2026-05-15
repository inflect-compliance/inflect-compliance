# 2026-05-15 — R20-PR-D: Tactile press + the Roadmap-20 capstone

**Commit:** `<sha> feat(buttons): R20-PR-D — tactile press + ambient elevation + R20 capstone`

## Design

PR-A laid the language. PR-B applied liquid edges. PR-C tightened
typography and density. PR-D closes the round with the final
tactile-material work AND locks the four PRs together as a unified
system.

### Sub-pixel tactile press

`active:translate-y-px motion-reduce:active:translate-y-0` lands in
the cva BASE alongside the existing R11-PR4 `active:scale-[0.97]`.
Press becomes BOTH a shrink AND a descend — the shrink alone reads
as "smaller", the combination reads as "pushed INTO the page". Active-
driven, not hover-driven (the motion-language ratchet's
`\bhover:translate-` ban explicitly preserves active translates as
the canonical click-feedback motion).

### State-conditional ambient elevation

`carbonSurface` adds two state overrides on the element's
box-shadow:

```ts
"shadow-[var(--btn-carbon-bevel)]",                                  // rest (R19, unchanged)
"active:shadow-[var(--btn-carbon-bevel),var(--btn-ambient-press)]",  // press (collapses)
"focus-visible:shadow-[var(--btn-carbon-bevel),var(--btn-ambient-focus)]", // focus (lifts + brand ring)
```

REST stays bevel-only — the R19 contract is preserved (locked by
`r19-pra-carbon-surface.test.ts`). Press composes `bevel,ambient-press`
so the ambient drop collapses to one tight stop alongside the bevel
— the surface depresses. Focus composes `bevel,ambient-focus` so the
ambient drop expands with the 4px brand-tinted ring — the surface
lifts deliberately.

Hover is unannotated here. PR-B's aura wash on `::after` IS the
hover indicator; pinning a second shadow on the element would
over-claim the hover moment.

### Disabled iridescent dust-out

`iridescentEdge` drops `disabled:after:opacity-30`. NOT zero (would
make disabled primary read as a structurally different button —
like the iridescent edge was painted on rather than finished into
the surface). NOT a transition (the `::after` already carries the
aura's `transition-shadow`; CSS allows only one `transition-property`
per element-rule, and adding `transition-opacity` here would override
the aura's smooth fade).

### Enriched `--ctrl-edge-focus`

The form-control parity edge token gains two ambient stops on top
of its 3px brand ring, in both themes:

```
--ctrl-edge-focus: 0 0 0 3px <brand@20%>,
                   0 1px 2px <ambient@high>,
                   0 2px 6px <ambient@low>;
```

A focused `<Input>`, focused date-picker trigger, and (transitively)
a focused combobox trigger now read "warm AND raised" the way a
focused button does — the same tactile-lift presence across the
control family.

### Capstone

`tests/guards/r20-prd-tactile-and-capstone.test.ts` locks the four
R20 PRs together as a unified system. The ratchet asserts:

  - every R20 token still exists in both themes;
  - every R20 recipe still exists;
  - the R19 system is undisturbed;
  - `docs/ui-buttons.md` carries the R20 section referencing each
    recipe + token category;
  - all four R20 ratchets exist as a contract surface (a future PR
    that strips one R20 ratchet trips THIS one).

## Files

| File | Role |
|---|---|
| `src/components/ui/button-variants.ts` | Adds `active:translate-y-px` to cva base; adds state-conditional ambient shadows + disabled dust-out to `carbonSurface` / `iridescentEdge` |
| `src/styles/tokens.css` | Enriches `--ctrl-edge-focus` with 2-stop ambient drop, in both themes |
| `docs/ui-buttons.md` | New "Liquid Elegance (Roadmap-20)" section: characteristics table, tokens table, two-pseudo rationale, R20 ratchet table |
| `tests/guards/r20-prd-tactile-and-capstone.test.ts` | 39-assertion ratchet: tactile press + state-conditional ambient + dust-out + enriched control focus + R20 capstone (token / recipe / R19-survival / docs / ratchet-surface) |
| `docs/implementation-notes/2026-05-15-r20-prd-tactile-and-capstone.md` | This file |

## Decisions

- **Why translate-y-px not translate-y-0.5.** Tailwind's `translate-y-px` is exactly 1 pixel; `translate-y-0.5` is 2px (0.5 × 4px spacing unit). One pixel is enough — the press is FELT, not seen.

- **Why ambient state shadows compose `bevel,ambient-*` not just `ambient-*`.** The bevel's inset highlights are the volume FROM the inside — those need to survive every state. Press without the bevel reads as "the surface dropped"; press with bevel preserved + ambient-collapsed reads as "the surface depressed BUT the material stayed wet". Same intent for focus.

- **Why no hover ambient shift.** PR-B's aura wash on `::after` is the hover indicator. Adding a `hover:shadow-[bevel,ambient-hover]` here would be a third hover signal (aura + ambient + variant bg shift) — over-competing. The aura already says "this is hovered".

- **Why disabled iridescent dust-out is at 30% not 0%.** 0% would make disabled primary read STRUCTURALLY DIFFERENT from primary — like the iridescent edge was a decorative overlay rather than a finished material. 30% reads as muted-but-still-there: the meniscus is dimmed by the disabled state, like a real metallic finish under low light.

- **Why no opacity transition on `::after` for dust-out.** The `::after` already carries the aura's `transition-shadow`. CSS allows ONE `transition-property` per element-rule; adding `transition-opacity` would override the shadow transition, which would make the aura snap on hover instead of fading in. Disabled is a steady state — snapping is acceptable. The aura's smooth fade is felt on every interaction, so keeping that win is the right tradeoff.

- **Why `--ctrl-edge-focus` is enriched in tokens.css (not via cva).** The token is consumed identically by `<Input>`, the date-picker trigger, and the date-picker open state. Enriching the token gives the lift to all three consumers in one place — adding ambient via cva would require touching each consumer separately and would create drift surface.

- **Why the capstone ratchet checks ratchet existence.** A future PR that strips `r20-prc-airy-density.test.ts` (for example, because "we don't need the per-size tracking anymore") would break THIS ratchet too. The capstone forms a meta-lock: the four R20 ratchets are a contract surface, not individual files that can be silently deleted.

- **What's NOT in R20 (deliberate scope cuts).** (1) Icon micro-shift on hover for `iconRight`: `group-hover:translate-*` is banned, and exempting for one micro-effect isn't worth the cost. (2) Carbon-tinted loading spinner: visually subtle, hard to land without rendered tests, deferred. (3) Iridescent edge on form controls: would over-claim attention on inputs; the brand-tinted focus halo is the right level of presence.

# 2026-06-18 — Mobile PR-1: touch ergonomics + input affordances

**Commit:** `<sha>` feat(mobile): 44px touch targets on coarse pointers + inputMode derivation

First PR of the mobile-friendliness roadmap (5 PRs). Foundation layer: make every
interactive control finger-friendly on touch devices, via the shared primitives
so it lands app-wide in one change.

## Design

**Touch targets (WCAG 2.5.5 / Apple HIG, 44px).** The dense desktop control
sizes (button `h-7..h-10` = 28–40px, input `h-8..h-10` = 32–40px) are below the
44px touch minimum. Rather than enlarge them everywhere (which would wreck
desktop density), we raise a 44px FLOOR only on **coarse pointers** using
Tailwind v4's `pointer-coarse:` variant — `min-height` only raises, so the
fine-pointer/desktop density is untouched:

- `button-variants.ts` cva **base** → `pointer-coarse:min-h-11`; the `icon` size
  also gets `pointer-coarse:min-w-11` so icon-only buttons become 44×44.
- `input.tsx` cva **base** → `pointer-coarse:min-h-11`.
- `filter-select.tsx` "Filter" trigger (a bespoke `h-10` button) → same.
- `globals.css` `@media (pointer: coarse)`: native `.input` controls get a 44px
  floor; the small Radix toggle controls (`role=checkbox|radio|switch`) keep
  their compact visual size but gain a 44px transparent `::before` hit-target.

Because the React `<Button>`/`<Input>` primitives back the overwhelming majority
of taps (and `<Combobox>`/`<Select>` triggers render through `<Button>`), this
one set of edits lifts the whole app.

**Input keyboard affordance.** `<Input>` now derives `inputMode` from `type`
when the caller doesn't set one (`email→email`, `tel→tel`, `number→numeric`,
`search→search`, `url→url`), so a correctly-typed field brings up the right
mobile keyboard with zero per-field churn. Explicit `inputMode` always wins.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/button-variants.ts` | coarse-pointer 44px min-h (base) + min-w (icon) |
| `src/components/ui/input.tsx` | coarse-pointer 44px min-h; `TYPE_TO_INPUTMODE` derivation |
| `src/components/ui/filter/filter-select.tsx` | trigger coarse-pointer 44px min-h |
| `src/app/globals.css` | `.input` floor + Radix toggle `::before` hit-target (coarse block) |
| `tests/guards/mobile-touch-targets.test.ts` | structural ratchet (each primitive carries the 44px coarse floor + inputMode derivation) |
| `tests/rendered/input-mobile-inputmode.test.tsx` | behavioural: type→inputMode, explicit override wins |

## Decisions

- **`pointer-coarse:` over a global `@media` button rule.** Scoping to the cva
  primitives keeps the floor off third-party/native buttons (cmdk items, xyflow
  controls) that have their own ergonomics, and keeps the change reviewable in
  one place. `min-*` (not fixed `h-11`) means desktop density is provably
  unchanged — the R20 density ratchets still pass.
- **Toggle hit-target via `::before`, not a bigger box.** Matches the P6-PR-B
  canvas-handle pattern: visual size stays, only the tappable area grows.
- **Derive `inputMode` in the primitive** instead of a per-field sweep — one
  change improves every already-typed field; a broad `type=` audit of every form
  is a deliberate fast-follow (can ride PR-3's chrome work).

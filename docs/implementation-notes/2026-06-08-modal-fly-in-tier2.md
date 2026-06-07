# 2026-06-08 — Modal "fly-in" (Tier 2)

**Commit:** `<sha>` feat(ui): modal fly-in entrance + snappy exit (macOS window-open feel)

## Goal

Modals should *fly* — pop toward the viewer on open like a macOS
window, instead of the prior near-invisible `scale(0.95) → 1` nudge.

## Design

CSS-keyframe motion on the existing Radix Dialog (no framer-motion, no
new dependency — matches how every other entrance in the app animates).

- **Entrance** `modal-fly-in`: panel scales `0.88 → 1`, fades in, over
  `0.3s` with a **back-out easing** `cubic-bezier(0.34, 1.56, 0.64, 1)`.
  The bezier's >1 control point makes scale overshoot ~2.5% past full
  size near the end, then settle — the spring/pop. Centre transform-
  origin grows it from the middle of the viewport. The overshoot lives
  in the keyframe's *easing*, not a third keyframe stop.
- **Exit** `modal-fly-out`: `scale 1 → 0.96` + fade, `0.15s ease-in`.
  Dismiss is snappier than open and has no overshoot (you don't bounce
  things away). Backdrop gets a paired `fade-out`.
- **State-gated**: both panel and overlay use
  `data-[state=open]:…` / `data-[state=closed]:…`, so Radix's Presence
  runs the exit animation before unmounting.

The overshoot easing is defined in `tailwind.config.js`'s `animation`
shorthand, NOT as an `ease-[…]` className — so the
`animation-language-lock` ratchet (which bans arbitrary easings in
markup) stays green. `0.3s` is in the locked duration set.

`prefers-reduced-motion` flattens both animations to 1ms globally
(tokens.css) — the modal appears/disappears instantly, no per-component
opt-in.

## Scope

- ✅ Desktop `Dialog.Content` (Modal) + `Modal.Confirm` (shared surface).
- ✅ Backdrop fade in/out.
- ❌ Mobile Vaul drawer (keeps its slide-up — sheets slide, windows fly).
- ❌ Sheets, popovers, menus (different metaphor).

## Files

| File | Role |
|------|------|
| `tailwind.config.js` | `modal-fly-in` / `modal-fly-out` / `fade-out` keyframes + animations (overshoot bezier) |
| `src/components/ui/modal.tsx` | panel + overlay swap to state-gated fly-in / fly-out |
| `tests/guards/modal-fly-in.test.ts` | locks the keyframe scale-up, the >1 overshoot bezier, and the state-gated wiring |

## Decisions

- **CSS keyframes over framer-motion.** Radix supports exit animations
  via Presence + `data-state`; staying CSS-native matches the codebase's
  single-motion-language and avoids the framer/Radix Presence interop
  fiddliness.
- **Overshoot in the easing, not the keyframe.** A two-stop keyframe +
  back-out bezier is simpler than a three-stop `0% → 70%(1.025) → 100%`
  and produces the same spring.
- **Tier 2 of 3.** 0.88 start / ~2.5% overshoot / 300ms is the "clear
  pop without feeling gimmicky" middle. Tier 1 (0.92/1.01/250ms) and
  Tier 3 (0.82/1.04 + perspective) were the conservative / theatrical
  alternatives; confirm dialogs open often, so the middle was chosen.
- **Trigger-origin "fly out of the button"** (scaling from the trigger's
  coordinates) was considered and deferred — it needs per-open geometry
  capture into a CSS var; center-origin is the macOS window-open default.

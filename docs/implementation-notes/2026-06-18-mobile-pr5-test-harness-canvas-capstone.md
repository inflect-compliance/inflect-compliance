# 2026-06-18 — Mobile PR-5: test harness + Processes canvas fallback + capstone

**Commit:** `<sha>` feat(mobile): mobile E2E sweep + touch emulation + canvas list fallback + roadmap capstone

Final PR of the 5-PR mobile-friendliness roadmap.

## Three deliverables

**1 — Processes canvas mobile fallback.** The xyflow canvas (pan/zoom/drag of a
node graph) is unusable on a phone. Below `md`, `CanvasWorkspace` renders a
read-only **list of process maps** (name, status badge, step/link counts,
description) with a "open on a larger screen to edit" banner — instead of
mounting the heavy canvas. Gated on `useIsBelowMd` (false on SSR/jsdom →
desktop + tests keep the canvas). `src/app/t/[tenantSlug]/(app)/processes/ProcessesClient.tsx`.

**2 — Mobile E2E harness.** `tests/e2e/responsive.spec.ts`:
- Added `hasTouch: true` to the 375×812 mobile scope so a coarse pointer is
  emulated — PR-1's `pointer-coarse:` 44px floors actually engage, and touch
  interactions match a real phone.
- Broadened the no-horizontal-overflow check from controls-only to a sweep over
  risks / policies / vendors / evidence / dashboard (each test self-contained).

  *Decision:* did NOT add separate per-device Playwright projects
  (iPhone/iPad/Pixel) — they ~2× the slowest CI job (E2E) for marginal extra
  realism over viewport + `hasTouch` emulation, and the layout behaviour is
  already locked by the structural ratchets. Left as an easy future addition;
  noted in the capstone.

**3 — Capstone meta-ratchet.** `tests/guards/mobile-roadmap-integrity.test.ts`
asserts every mobile guard (R11 readiness, R14 parity, P6 touch, PR-1…PR-5)
still exists + is non-trivial, the canonical `useIsBelowMd` hook is in the
shared barrel, and the responsive spec carries the sweep + touch emulation —
the "guard the guards" pattern this repo uses (ci-pipeline-integrity, etc.).

## Files

| File | Role |
| --- | --- |
| `…/processes/ProcessesClient.tsx` | mobile process-list fallback (`ProcessListMobile`) |
| `tests/e2e/responsive.spec.ts` | `hasTouch` + overflow sweep across 5 surfaces |
| `tests/guards/mobile-canvas-fallback.test.ts` | locks the canvas→list gate |
| `tests/guards/mobile-roadmap-integrity.test.ts` | capstone over all mobile guards |

## Roadmap recap (all 5 PRs)

1. Touch ergonomics — coarse-pointer 44px floors + `inputMode` derivation.
2. Responsive DataTable — stacked card view below `md`.
3. Viewport-safe popovers — clamp every floating surface; forward ratchet.
4. Dashboard — single-column stack below `md`.
5. Test harness + canvas fallback + capstone (this PR).

Every change is gated on `pointer-coarse:` / `useIsBelowMd` / `sm:` so a
standard mouse-driven desktop is byte-for-byte unchanged.

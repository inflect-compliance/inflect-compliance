# 2026-06-08 — Visual Editor Reachability (PR-B)

**Commit:** `<sha>` feat(processes): make the visual rule editor reachable + wire dead VR code

## Why

The audit found the Visual Rule Editor (VR-1…VR-10) was **built but dark to
users**: there was no UI path to create or switch a map into AUTOMATION mode
(the whole feature was reachable only by a hand-crafted API call), and three
pieces were pure dead code — `CanvasOverlayProvider`, `RunModeProvider`/Run
toggle, and `inferEdgeKind` (never called).

## What

- **AUTOMATION mode is now creatable** — `handleNew(canvasMode)` + a "New
  automation workflow" command-menu item POST `canvasMode: 'AUTOMATION'`. This
  unblocks every downstream surface (automation palette section, inspector,
  sync bridge) that gates on `canvasMode === 'AUTOMATION'`.
- **Overlay + Run Mode wired (VR-6 dead → live)** — `PersistedProcessCanvas`
  now mounts `RunModeProvider` → `OverlayBridge` (reads run mode, turns on the
  3s overlay poll) → `CanvasOverlayProvider`. A **Run Mode toggle**
  (Design ↔ Live) lives in the document bar, automation-mode-only.
- **Edge-kind inference wired (VR-5 dead → live)** — `onConnect` calls
  `inferEdgeKind(srcKind, tgtKind)` and stamps the semantic `edgeKind` on the
  new edge; non-automation pairs infer `'flow'` and carry no `edgeKind`, so
  document maps are untouched.

## Ratchet

`tests/guards/visual-editor-reachability.test.ts` keeps all four wirings live —
fails CI if the providers stop being mounted, `inferEdgeKind` stops being
called, the AUTOMATION create path disappears, or the Run toggle is removed.
This converts "dead code that compiles" into "wired code the ratchet defends."

## Deferred (follow-ups)

- Doc-bar toggle to switch an **existing** map's mode (the create path covers
  new-map reachability; switching an existing DOCUMENT map to AUTOMATION is a
  PATCH + a smaller toggle).
- Governance Graph nav link (the `/processes/governance` route works; it needs
  a header entry) — and the in-canvas sub-flow picker + edge pass/fail branch
  picker, which build on these now-live seams.

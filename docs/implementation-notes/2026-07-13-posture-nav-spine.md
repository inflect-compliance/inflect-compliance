# 2026-07-13 — Posture navigation spine, coverage disambiguation, dead surfaces (R2-P3)

**Commit:** _(R2-P3 of the controls-posture roadmap)_

## Design

The universal posture spine is per-framework coverage/readiness (all ~15
frameworks the platform ships), NOT the SoA (an ISO 27001 Annex A artifact).
The spine was unnavigable and several surfaces were dead or misleading.

- **Sidebar spine.** Added a "Compliance" section with **Frameworks** (`/frameworks`)
  + **Coverage map** (`/coverage`). Frameworks had been dropped from the sidebar
  (R13-PR12, ⌘K-only) — hiding the only creation path that feeds posture for
  every framework.
- **SoA scoped to ISO-family.** `getSoA` now returns `isIsoFamily` (`kind ===
  'ISO_STANDARD'`). For a non-ISO pack (SOC 2 / NIS2 / …) the SoA view renders a
  labelled notice — "the SoA is an ISO Annex A artifact; view this framework's
  coverage & readiness instead" — with a link, rather than passing an
  ISO-native applicability statement off as native to that framework.
- **"coverage" disambiguated.** The `/coverage` page (risk/asset↔control link
  density) is retitled **"Control coverage map"** / nav **"Coverage map"**; the
  per-framework requirement↔control percentage keeps the primary "Coverage"
  label.
- **Dead/misleading surfaces.**
  - `BestValueControls` (RQ3-8 leaderboard, mounted nowhere) is now mounted on
    the controls dashboard.
  - The Clauses checklist rendered interactive checkboxes with no state/handler
    (ticks lost every render) — now a static reference list.
  - `controls/dashboard` (a read-only KPI view) was gated behind
    `controls.create`; ungated so READERs see posture. Only the template-install
    action stays create-gated.
- **Swallowed failures surfaced.** SoA `handleMapControl` + `handleSaveJustification`
  now `catch` and toast (were unhandled throws that left the modal open); the
  frameworks page tracks `coverageErrors` so a failed computation renders "—"
  ("couldn't load") instead of a fabricated 0% indistinguishable from a genuine
  0%.
- **SoA control picker.** Restored a searchable picker, pre-filtered to controls
  NOT already mapped to that requirement (an unfiltered 90+ list was unusable).

## Deferred (documented follow-ups)

- **Non-ISO SoA** shows a redirect notice + the full rollup (same data, honestly
  labelled) rather than fully swapping the render to the coverage view — a
  larger routing change.
- **`install/page` + `templates/page`** load-catch error surfacing (lower-traffic
  wizard/list loads) and the **Sankey** static-chart interactivity are left for
  a follow-up.

## Files

| File | Role |
|---|---|
| `src/components/layout/SidebarNav.tsx` | Compliance section (Frameworks + Coverage) |
| `.../reports/soa/SoAClient.tsx` | error toasts, searchable pre-filtered picker, non-ISO notice |
| `src/app-layer/usecases/soa.ts` + `src/lib/dto/soa.ts` | `isIsoFamily` |
| `.../frameworks/page.tsx` + `FrameworksClient.tsx` | coverage error vs 0% |
| `.../controls/ControlsClient.tsx` | dashboard ungated |
| `.../controls/dashboard/page.tsx` | mounts BestValueControls |
| `.../clauses/ClausesBrowser.tsx` | static checklist (no state-losing checkbox) |
| `messages/{en,bg}.json` | nav + soaView + coverage keys |
| `tests/guards/p3-posture-nav-spine.test.ts` | ratchet |

# 2026-07-13 — In-force control exceptions → EXCEPTED verdict (R2-P5)

**Commit:** _(R2-P5 of the controls-posture roadmap)_

## Design

An approved control exception applies to a **control**, regardless of
framework, so it must suppress the gap in **every** framework's
coverage/readiness — not only the ISO SoA. The EXCEPTED verdict therefore
lives in the ONE shared per-requirement rollup, so it flows everywhere by
construction.

- **Shared verdict.** `rollUpRequirementVerdict(controls)` in
  `requirement-status-rollup.ts` (the helper R2-P1 anticipated) is the single
  rollup both `soa.ts` and `framework/coverage.ts` now call. Rule: a
  requirement whose applicable controls are otherwise a gap (worst applicable
  control below IMPLEMENTED) is **EXCEPTED** iff *every* gapping applicable
  control is covered by an in-force exception; a single un-excepted gap keeps
  the whole requirement a gap. EXCEPTED can never read as implemented.
- **In-force = live status.** An exception counts only when `status ===
  'APPROVED' AND expiresAt > now`. Both rollups load exceptions with that
  filter, so reversion is automatic the instant one expires — no scheduling
  (the exception-expiry-monitor still flips APPROVED→EXPIRED independently).
  Only exceptions on an APPLICABLE control count.
- **Flows to all frameworks.** Because the verdict is shared,
  `generateReadinessReport` gained `exceptedRequirements` and the ISO SoA
  gained `summary.excepted` + per-row `verdict` / `exceptedUntil` — a SOC 2 or
  NIS2 tenant sees EXCEPTED in its framework readiness even though it has no
  SoA.
- **UI.** The SoA screen renders a distinct `ExceptedBadge` ("Excepted until
  <date>") + an Excepted summary card; the printable SoA labels excepted
  requirements as excepted with the expiry (never "implemented"); the control
  header badge reads "Excepted until <date>" when in-force.
- **Anti-gaming.** Always visibly labelled + time-boxed (approval already
  requires a future `expiresAt`); auto-reverts to the real gap on expiry;
  never renders a requirement as Covered/Implemented.

## Decisions

- **Coverage % (mapping density) is intentionally unaffected.**
  `computeCoverage` still divides mapped/total requirements — only the
  implementation/readiness *verdict* changes. This keeps the three
  disambiguated "coverage" meanings (R2-P3) from being conflated; the ratchet
  asserts `computeCoverage` never consults the verdict/exception logic.
- **"Excepted until" is the EARLIEST gapping exception's expiry** — after that
  date a control reverts to a real gap, so the requirement is only excepted
  until the first cover lapses.

## Files

| File | Role |
|---|---|
| `src/lib/compliance/requirement-status-rollup.ts` | `rollUpRequirementVerdict` + EXCEPTED |
| `src/app-layer/usecases/soa.ts` | load in-force exceptions; EXCEPTED verdict + summary + row |
| `src/app-layer/usecases/framework/coverage.ts` | shared verdict; `exceptedRequirements` |
| `src/lib/dto/soa.ts` | `verdict` / `exceptedUntil` / `summary.excepted` |
| `.../reports/soa/SoAClient.tsx` | ExceptedBadge + summary card |
| `.../reports/soa/print/SoAPrintView.tsx` | excepted print label |
| `src/components/ControlExceptionsPanel.tsx` | header badge "Excepted until <date>" |
| `messages/{en,bg}.json` | excepted / exceptedUntil keys |
| `tests/unit/requirement-verdict-excepted.test.ts` | framework-agnostic verdict tests |
| `tests/guards/p5-excepted-verdict.test.ts` | structural ratchet |

# 2026-06-24 — Coverage Wave C (usecases branch tests + floor lock + measurement correction)

**Commit:** `<pending>` test(coverage): wave-C usecases branch tests + usecases floor 69→72; correct the global-coverage measurement

## Summary

Wave C set out to push the **global** branch floor from 62 toward the
≥65 target that Wave B deferred. In the course of measuring it, a
**measurement error in the Wave B framing was found and corrected**, which
changes the conclusion:

- The authoritative CI gate — the `--coverageThreshold` "does not meet"
  lines, run WITH the integration database — measures **global branches
  at 62.54%**, exactly as Wave B reported. The ≥65 global goal is **NOT
  met** and genuinely needs a large wave over the never-loaded backend
  `.ts` files. Wave B's deferral was correct.
- An intermediate analysis briefly read **67.77%** off the jest
  "Coverage summary" line and concluded the goal was already met — that
  is the *loaded-files-only* number the Wave B note explicitly warns
  against (`coverage-summary.json` overstates the full-universe global by
  ~7pp because it omits never-loaded files). The gate number is the only
  authoritative one.

What Wave C **did** land: real branch tests for four previously-0%
usecase files, lifting the **usecases/ cohort** (Tier A) past its 70/70/80
end-state target, and locking that in via the ratchet.

## Design

### Why local coverage runs mislead

`collectCoverageFrom` is `src/app-layer/**/*.ts` + `src/lib/**/*.ts`
only — React `.tsx` and `src/app` pages are NOT in the gate universe, so
rendering tests cannot move the global (an earlier note and the Wave B
doc both wrongly blamed the React surface; corrected here and in
`coverage-policy.md`).

Two further traps, both now documented:

1. **No DB ⇒ ~95 integration suites skip.** A local `npx jest --coverage`
   without a database silently skips the DB-backed integration suites,
   which undercounts every file covered only by an integration test
   (e.g. Wave B's `test-hardening`, `data-lifecycle`). The gate-accurate
   run must point `DATABASE_URL_TEST` at a live, migrated test DB.
2. **Loaded-only vs full-universe.** Even with the DB, the "Coverage
   summary" text-summary counts only loaded files. The binding number is
   the `--coverageThreshold` gate's "does not meet" line. To read it,
   run the gate with a deliberately-high threshold so every scope prints.

### Authoritative gate actuals (with DB, full universe)

| Scope | branches | functions | lines | statements |
|-------|----------|-----------|-------|------------|
| global | 62.54 | 62.11 | 77.17 | 75.65 |
| usecases/ | **72.93** | 77.35 | 86.03 | 84.43 |
| policies/ | 87.12 | 96.82 | 94.38 | 93.65 |
| events/ | 75.30 | 62.50 | 80.42 | 79.08 |
| lib/ | 78.61 | 81.61 | 90.22 | 88.93 |

`jest.thresholds.json` usecases/ raised **69/73/81/80 → 72/76/85/83**
(~1pp slack under actual). `RATCHET_FLOOR` (in
`tests/guards/coverage-ratchet.test.ts`) hardened to the pre-wave-C
enforced level **69/73/81/80** so the gain cannot silently slip. Global
and the other cohort floors left unchanged — their headroom is <1.2pp
(no safe room to ratchet without eating the jitter buffer), and Wave C
did no work in those cohorts.

## Files

| File | Role |
|------|------|
| `tests/unit/onboarding-automation.test.ts` | REPLACED a copy-the-logic test (real module 0%) with one that imports the real `runStepAction`/`storeActionResult` → 96% branches |
| `tests/unit/vendor-audit-usecase.test.ts` | NEW — evidence bundles + subprocessors; frozen-guards, freeze snapshot loop, self-subprocessor reject → 97% |
| `tests/unit/framework-catalog-usecase.test.ts` | NEW — version-vs-key resolution + not-found arms → 100% |
| `tests/unit/framework-tree-usecase.test.ts` | NEW — `getFrameworkTree` + the four `reorderFrameworkRequirements` validation branches → 95% |
| `jest.thresholds.json` | usecases/ floor 69/73/81/80 → 72/76/85/83 |
| `tests/guards/coverage-ratchet.test.ts` | `RATCHET_FLOOR` usecases/ hardened 66/62/77/74 → 69/73/81/80 |
| `docs/coverage-policy.md` | corrected the loaded-vs-gate + React-surface narrative; added the Wave C row; refreshed the floors-vs-targets table |

## Decisions

- **The `onboarding-automation` prior test was a false positive.** It
  re-declared `inferAssetType` / `STARTER_RISKS` / the risk filter as
  local copies and asserted against those, so the real module stayed at
  0% and the copies could drift. Replaced with a real-import test. This
  is the anti-pattern the policy's "branch + behavioural assertions or
  it does not count" rule exists to catch.
- **Global floor not raised.** Actual 62.54 vs floor 62 is 0.54pp — below
  the jitter buffer the policy mandates. Raising it would risk a red
  main build for ~0.5pp of paper gain. The honest lever is the deferred
  backend-`.ts` wave, not a floor squeeze.
- **≥65 global remains deferred — and is now correctly scoped.** It needs
  coverage of the never-loaded `.ts` files in the gate universe
  (`repositories/*`, `reports/pdf/*`, `integrations/*`, `lib/hooks/*`,
  schemas), NOT React rendering tests. That is the next wave.
- **Verified against the exact CI gate** (`npx jest --coverage --forceExit
  --coverageThreshold "$(cat jest.thresholds.json)"`, integration DB
  attached) → exit 0.

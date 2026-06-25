# 2026-06-25 — Coverage Wave D batch 4 (lib/processes + lib/hooks)

**Commit:** `<pending>` test(coverage): wave-D batch 4 — 8 lib hooks/processes; lib/ floor up; rendered-floor 182→194

## Summary

Final batch of Wave D — additive coverage of the `lib/processes` +
`lib/hooks` surface (the last meaningful never-loaded `.ts` cluster).
Eight previously-0% files: pure-TS canvas modules tested under node, and
React hooks tested under jsdom via `renderHook`.

| File | Project | Branches |
|------|---------|----------|
| `lib/processes/canvas-drill-filter.ts` | node | 100% |
| `lib/processes/edge-controls.ts` | node | 100% |
| `lib/processes/canvas-clipboard.ts` | node | 92.9% |
| `lib/processes/use-canvas-history.ts` | jsdom | 100% |
| `lib/processes/use-canvas-drill-stack.ts` | jsdom | 100% |
| `lib/processes/canvas-change-events.ts` | jsdom | 100% |
| `lib/processes/use-canvas-autosave.ts` | jsdom | 94.1% |
| `lib/hooks/useUrlFilters.ts` | jsdom | 62.5% |

108 tests. The thin SWR data-hook wrappers (`use-api`, `use-controls`,
`use-risks`, …) were deliberately skipped — 1–4 branchy constructs each,
mostly provider plumbing, very low ROI.

## Result

| Scope | Before | After (gate actual) | Floor change |
|-------|--------|--------------------|--------------|
| `lib/` branches | 78.77% | 79.10% | 78 (unchanged — +0.33 too thin) |
| `lib/` functions | 81.86% | 82.70% | 80 → **81** |
| `lib/` lines | 90.37% | 90.63% | 88 → **89** |
| `lib/` statements | 89.10% | 89.36% | 86 → **88** |
| global branches | 66.25% | 66.25% | 65 (unchanged) |

Global held — the batch-4 files are small, so their covered branches
round under the ≈38,800-branch global denominator. The gains are real at
the `lib/` cohort level, so the lock lives there.

## Notes / decisions

- **`useUrlFilters` 62.5%.** The uncovered branches are four
  `typeof window === 'undefined'` SSR guards and the hydration-divergence
  arm — genuinely unreachable under jsdom (`window` is always defined and
  `window.location` is non-configurable, so the initializer and mount
  effect always read the identical URL). Documented in the test.
- **`canvas-clipboard` 92.9%** — the one gap is an `idMap.get(e.x) ?? e.x`
  fallback for an edge whose endpoint isn't in the map; `copyToClipboard`
  only stores internal edges, so it's unreachable via the public API.
- **`RENDERED_TEST_FLOOR` 182 → 194.** The five new `tests/rendered/`
  renderHook files pushed the rendered-test population past the
  `rendered-coverage-floor` ratchet's slack (8). Raised the floor to the
  new count in the same PR, per that guard's upward-ratchet contract.
- Typecheck (`npm run typecheck`) clean; all mock fns taking spread args
  typed `(...args: any[])`.

## Wave D — complete

Final trajectory: global branches **62.54 → 63.88 (b1) → 65.94 (b2,
≥65 MET) → 66.25 (b3) → 66.25 (b4)**. Cohort floors locked along the way
(usecases 79, lib 78/81/89/88, global 65). The ≥65 goal that Wave B
deferred is achieved and held by the ratchet.

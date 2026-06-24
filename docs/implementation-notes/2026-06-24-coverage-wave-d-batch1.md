# 2026-06-24 — Coverage Wave D batch 1 (backend usecases/services/jobs)

**Commit:** `<pending>` test(coverage): wave-D batch 1 — 8 backend files; global branches 62.54→63.88

## Summary

First batch of the wave that pursues the **global ≥65 branch** target
deferred since Wave B. Branch tests for eight node-testable backend
files (usecases / services / jobs), authored in parallel and each
self-verified to 94–100% file-level branches.

| File | Branches | Tests |
|------|----------|-------|
| `usecases/soa.ts` | 100% | 18 |
| `jobs/automation-runner.ts` | 100% | 22 |
| `usecases/risk-scenario.ts` | 100% | 28 |
| `usecases/scim-users.ts` | 98.9% (combined) | 34 |
| `services/policy-lifecycle-adapter.ts` | 98.8% | 56 |
| `usecases/risk-report.ts` | 96.6% (combined) | 40 |
| `usecases/risk-appetite.ts` | 95.2% | 32 |
| `usecases/audit-readiness-scoring.ts` | 94.2% (combined) | 26 |

All pure unit tests (no DB) — `runInTenantContext` / `@/lib/prisma` /
audit emitter / policies mocked at the boundary; the FAIR calculator is
kept real in `risk-scenario` so recompute math is genuinely exercised.

## Result

| Scope | Before | After (gate actual) | New floor |
|-------|--------|--------------------|-----------|
| global branches | 62.54% | **63.88%** | 63 |
| usecases branches | 72.93% | **79.97%** | 79 |

Global moved **+1.34pp**; usecases **+7.04pp**.

## The denominator recalibration

Wave C's note implied the gate total was ≈22,717 branches (need +560 for
65%). That was derived from the **loaded-only** istanbul count and is
wrong. Two Wave-D data points (62.54% → 63.88% for ~+520 covered
branches) put the true gate total at ≈**38,800 branches**. So:

- 65% needs ~25,200 covered; we're at ~24,800 → **~+435 more** covered
  branches remain.
- That is **batch 2** (repositories: `VendorRepository` 7%,
  `ProcessMapRepository` 31%, `WorkItemRepository` 41%,
  `ControlRepository` 33%, `AuditRepository`/`AccessReviewRepository`
  0% — ~500+ uncovered branches between them).

So this batch is a **global ratchet to 63**, not the ≥65 finish line.

## Decisions

- **Parallel measurement is a safe lower bound.** The actuals were read
  from a parallel `--coverageThreshold` run (8 skipped suites). CI runs
  the gate `--runInBand` (0 skipped), so its coverage is ≥ the measured
  values — floors set at actual-minus-~1pp pass CI by construction.
- **Floors raised to actual-minus-~1pp**, `RATCHET_FLOOR` hardened to the
  pre-batch enforced level (global 62/61/76/75, usecases 72/76/85/83) so
  the gain can't silently slip.
- **One pre-existing test extended, not duplicated.** `risk-report`,
  `audit-readiness-scoring`, and `scim-users` had partial suites; new
  `*-branches.test.ts` companions cover the remaining branches.
  `policy-lifecycle-adapter`'s existing file was extended in place (its
  `PolicyEditableAdapter` class was the entire 0% gap).

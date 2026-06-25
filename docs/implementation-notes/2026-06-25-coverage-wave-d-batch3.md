# 2026-06-25 — Coverage Wave D batch 3 (PDF report generators + zod schemas)

**Commit:** `<pending>` test(coverage): wave-D batch 3 — 5 PDF generators + 3 schemas (additive; cushion 65.94→66.25)

## Summary

Additive coverage on top of the already-met ≥65 global branch target.
Eight previously-0% files, authored in parallel.

| File | Branches |
|------|----------|
| `reports/pdf/policyDocument.ts` | 97.3% |
| `reports/pdf/processMap.ts` | 100% |
| `reports/pdf/auditReadiness.ts` | 100% |
| `reports/pdf/riskRegister.ts` | 100% |
| `reports/pdf/gapAnalysis.ts` | 100% |
| `schemas/process-map.ts` | 100% |
| `lib/schemas/vendor-form.ts` | 100% |
| `lib/schemas/asset-form.ts` | 100% |

111 tests. `lib/dto/soa.ts` was correctly **skipped** — it is pure
`interface` declarations with no executable runtime.

## Approach

- **PDF generators run for real.** PDFKit works natively under node, so
  the tests let the real layout/table/section helpers run and drain the
  doc to a `Buffer` (asserting the `%PDF` header + non-empty output),
  varying input shapes to hit every section/table/fallback branch
  (empty-vs-populated tables, applicable yes/no/unmapped, classification
  watermark arms, `'—'` fallbacks, tenant-name fallbacks, score
  zero-division guards). Only the data boundary is mocked
  (`getSoA`/`runSoAChecks`/repos/prisma). `processMap` even hand-builds a
  valid tiny PNG so `doc.image()` decodes for real.
- **Schemas** parse valid + invalid inputs, covering every field
  constraint, default, array cap, and `.refine()` path.

## Result & decision

| Scope | Before | After (gate actual) |
|-------|--------|--------------------|
| global branches | 65.94% | 66.25% |
| global functions | 64.53% | 64.71% |
| global lines | 79.12% | 79.34% |
| global statements | 77.70% | 77.93% |

**Floors NOT raised.** Each metric gained <1pp; bumping the global floor
to 66 would leave only ~0.25pp of jitter buffer against the
parallel-measured actual, which is too thin to be safe on a loaded CI
runner. The new tests are kept as additive coverage — they widen the
cushion above the 65 floor (0.94pp → 1.25pp on branches) and lock 8
files against regression via the existing global gate. The next safe
floor bump waits until accumulated gains clear a full point.

Typecheck (`npm run typecheck`) clean; all mock fns taking spread args
or indexed `.mock.calls` typed `(...args: any[])`.

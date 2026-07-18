# 2026-07-18 — Report exports on the readiness spine (PR-U)

**Commit:** `<sha> feat(reports): compute Audit Readiness + Gap Analysis PDFs off the readiness spine (shown==exported, de-ISO)`

## Design

The reports hub redesign (PR-H) moved the on-screen report VIEW onto the
readiness spine — `generateReadinessReport(ctx, frameworkKey)` in
`src/app-layer/usecases/framework/coverage.ts` — but the **PDF exports**
(`auditReadiness.ts`, `gapAnalysis.ts`) still computed off the old SoA
engine (`getSoA` + `runSoAChecks`). Two bugs fell out of that split:

1. **shown ≠ exported.** The screen and the PDF ran two different
   computations, so coverage %, readiness score, implemented / gap /
   excepted, and the per-section breakdown could disagree for the
   selected framework.
2. **ISO-shaped PDFs for non-ISO frameworks.** `runSoAChecks` applies
   four Annex-A rules unconditionally, and the generators emitted
   Applicability / Justification columns and a "the SoA is audit-ready"
   verdict regardless of framework family — so a SOC 2 or NIS2 export
   leaked ISO Statement-of-Applicability constructs.

Both generators now resolve the framework the same way the view does
(`options.framework` if forwarded, else `resolveInstalledFrameworkKey`)
and read a single `generateReadinessReport` payload. The SoA remains a
separate **ISO-only** artifact (`/reports/soa` + the SoA CSV export),
which still legitimately use `getSoA` / `runSoAChecks` — those callers
are untouched.

`generateReadinessReport`'s payload gained one additive field —
`isIsoFamily: fw.kind === 'ISO_STANDARD'` — so the residual label gating
(`auditReadinessLabels` / `gapAnalysisLabels`, PR-H) can keep the ISO
"Statement of Applicability" subtitle wording gated behind the family
without a second framework lookup. No other payload field was added, to
avoid breaking the exact-match `toEqual` coverage tests.

"Gap" now means ONE thing across the surface: the KPI tile is relabeled
`gapsMappedNotImplemented` ("Mapped, not implemented" =
`summary.gapRequirements`), and the Gap Analysis export reports the two
on-screen populations explicitly — `unmapped` (no mapping) +
`gapRequirements` (mapped-not-implemented) — instead of a third,
broader SoA-check definition.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/framework/coverage.ts` | Added additive `isIsoFamily` to the `generateReadinessReport` payload |
| `src/app-layer/reports/pdf/auditReadiness.ts` | Rewritten onto the readiness spine — summary metrics, readiness verdict (no "SoA"), coverage-by-section + unmapped tables |
| `src/app-layer/reports/pdf/gapAnalysis.ts` | Rewritten onto the readiness spine — unmapped + mapped-not-implemented populations, no SoA-check tables |
| `src/app/t/[tenantSlug]/(app)/reports/ReportsClient.tsx` | KPI tile relabeled `tx('gaps')` → `tx('gapsMappedNotImplemented')` |
| `messages/en.json`, `messages/bg.json` | `gaps` key replaced with `gapsMappedNotImplemented` |
| `tests/unit/reports/pdf/{auditReadiness,gapAnalysis}.test.ts` | Retargeted from `getSoA`/`runSoAChecks` to `generateReadinessReport`/`resolveInstalledFrameworkKey` |
| `tests/unit/reports-deiso-exports.test.ts` | Forwarding tests now assert the framework threads to `generateReadinessReport` |
| `tests/unit/reports/pdf/readiness-shown-equals-exported.test.ts` | New behavioural test: shown==exported values + no ISO literal leak for a non-ISO payload |

## Decisions

- **Migrate, don't dual-source.** Rather than patch the SoA-engine exports
  to conditionally hide ISO columns, both PDFs were fully re-pointed at the
  readiness spine. One computation, one source of truth — shown==exported
  is structural, not a reconciliation the two paths have to keep in sync.
- **Keep the SoA engine for its ISO home.** `getSoA` / `runSoAChecks` are
  not deleted — the standalone `/reports/soa` page + CSV export are the
  legitimate ISO-only Statement-of-Applicability surface. PR-V cleans up
  that surface separately.
- **Additive payload change only.** `isIsoFamily` is the sole new field on
  the readiness payload; the exact-match coverage test (`framework-coverage.test.ts`)
  passes unchanged because nothing else moved.
- **Behavioural acceptance asserts on captured primitive data, not PDF
  text.** PDF text extraction is environment-fragile in CI (fonts); the
  shown==exported test mocks the pdf primitives and asserts on the values
  passed to `addSummaryMetrics` / `renderTable`, plus a regex sweep for
  ISO literals across every emitted string.

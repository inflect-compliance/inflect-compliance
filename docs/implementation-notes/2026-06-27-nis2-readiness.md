# 2026-06-27 — NIS2 readiness scoring + gap materialization + results view

**Commit:** `<pending>` feat(nis2): readiness scoring + gap-to-finding materialization + results view

## What

Makes the NIS2 self-assessment answers (Prompt 1/2) ACTIONABLE: a weighted
readiness score, a prioritized gap list, a trend line, and — on explicit
user action — Findings + remediation Tasks. **Complements**, does not
replace, the cross-framework traceability gap analysis
(`gap-analysis.ts`): that measures control *coverage*; this measures
self-reported *maturity*.

## The scoring model (OUR defensible choices — not from the source)

- **maturity:** YES=1.0, PARTIALLY=0.5, NO=0.0, NA=excluded.
- **criticality weight:** CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1.
- **domain score** = 100 × Σ(weight·maturity) / Σ(weight) over *answered*
  (non-NA) questions.
- **overall** = the same weighted ratio aggregated across all answered
  questions — i.e. domains weighted by their answered-question weight (a
  domain of 20 CRITICAL questions counts more than one trivial LOW one).
  Chosen over equal-per-domain weighting because a domain's importance
  scales with the stakes of its questions.
- **NA excluded from numerator AND denominator** — a not-applicable
  question must not penalize the score.
- **gap** = an answered question with NO or PARTIALLY.
- **gap priority** (sort key) = criticality·10 + consequence·3 +
  fineExposure·8 + timeToFix-bonus + answer-severity. A CRITICAL +
  fineExposure + PERSONAL_LIABILITY + QUICK_WIN gap tops the list
  (high stakes, fast fix). Unit-tested with known inputs.

`scoreNis2Assessment` is a **pure function** (no DB) so the model is
exhaustively unit-tested; `computeNis2Readiness` is the thin DB wrapper.

## Idempotent, reconciling materialization (explicit, never automatic)

`materializeNis2Gaps` creates a `Finding` (via the finding **usecase** —
sanitisation + audit + validation come for free, never raw prisma) for
each gap at/above a criticality threshold (default HIGH), tagged
`sourceKind='NIS2_SELF_ASSESSMENT'` + `sourceRef=<questionId>`. Re-running:

- existing OPEN finding for the question → left alone (no dup);
- existing CLOSED finding, gap returned → **reopened**;
- finding whose question is no longer a gap (answer now YES/NA) →
  **CLOSED** (reconciliation).

Idempotency + reconciliation are proven by `tests/unit/nis2-materialize.test.ts`
with stateful mocks (create appends to a store that the dedupe lookup
reads back) — run-twice-same-count, NO→YES closes, YES→NO reopens.

Findings get the two new generic `Finding.sourceKind` / `sourceRef`
columns (migration `20260627120000_finding_source_tag`, indexed
`[tenantId, sourceKind, sourceRef]`). **Tasks** link to their finding via
`metadataJson` — there is no `FINDING` value in `TaskLinkEntityType` and
no existing finding↔task relation (the prompt's premise was stale), so
metadata is the pragmatic, migration-free linkage.

## Snapshots + trend (reuses ReadinessSnapshot)

No new model: `snapshotNis2Readiness` writes a `ReadinessSnapshot` row
with a **distinct** `frameworkKey='NIS2_SELF_ASSESSMENT'` (so it never
collides with audit-readiness snapshots for the NIS2 *framework*).
Snapshotted on assessment completion (best-effort). The results view
renders the trend with the time-series chart platform.

## The chart-platform constraint (honest deviation)

The shared chart platform (Epic 59) is **time-series only** — its datum is
`{ date: Date; values }`. The readiness **trend over time** fits it
perfectly (`<TimeSeriesChart type="bar">`). A *categorical* domain bar
chart does not fit, so the **domain breakdown is a `<DataTable>`** (sorted
lowest-first) rather than a categorical bar chart — avoiding the Epic 59
inline-progress-bar ban while staying on platform primitives.

## Disclaimer (load-bearing)

The view prominently states this is **a self-assessment maturity aid, not
a legal compliance determination** — it informs remediation, certifies
nothing, replaces no auditor. The CC BY 4.0 attribution renders here too.

## Files

| File | Role |
|------|------|
| `src/app-layer/usecases/nis2-readiness.ts` | pure scoring + readiness + materialize + snapshot + focus-areas |
| `src/app-layer/usecases/onboarding-nis2.ts` | snapshot-on-complete wiring (+ typed `db`) |
| `src/app-layer/usecases/finding.ts` + `src/lib/schemas/index.ts` | `sourceKind`/`sourceRef` threaded through createFinding |
| `src/app-layer/repositories/FindingRepository.ts` | `listBySource` (dedupe lookup) |
| `prisma/schema/compliance.prisma` + migration | `Finding.sourceKind`/`sourceRef` + index |
| `src/app/api/.../nis2-assessment/{readiness,materialize}/route.ts` | GET readiness · POST materialize |
| `src/app/t/.../frameworks/[frameworkKey]/readiness/**` | results view (KPIStat + chart + DataTable + confirm) |
| `tests/unit/nis2-readiness.test.ts` · `tests/unit/nis2-materialize.test.ts` | scoring + idempotency/reconciliation |
| `tests/guardrails/nis2-readiness-coverage.test.ts` | structural ratchet |

## What this is NOT

- **Not** auto-creation — every materialization is an explicit user
  action behind a confirm.
- **Not** a regulatory certification — see the disclaimer.
- **Not** multi-respondent delegation — `respondent`/consequence is a hint.
- **Not** a per-control gap→requirement map — control-baseline help is a
  lightweight domain-level "focus areas" suggestion (lowest-scoring
  domains), not an auto-install.

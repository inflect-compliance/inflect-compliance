# 2026-06-11 — RQ2-8: assessment-staleness engine

**Commit:** _(this commit)_ — staleness detector + report endpoint + dashboard widget

## Design

A risk register rots silently: the score stays green while the
world underneath moves. The engine names three rot classes in
`src/lib/risk-staleness.ts` (pure — the RQ2 lib pattern):

```
REVIEW_OVERDUE        nextReviewAt in the past (the tenant's own
                      cadence, broken)
ASSESSMENT_AGED       last RQ2-1 provenance event older than 180
                      days (MAX_ASSESSMENT_AGE_DAYS)
CONTROLS_MOVED_SINCE  a linked control's COMPLETED test run is
                      newer than the residual assessment — the
                      evidence changed, the conclusion didn't
```

**The no-noise contract:** a risk with NO signals (no events, no
review date, no test runs) is NOT stale. Absence of data is a
coverage problem; conflating it with staleness would flood the
widget with every un-reviewed risk and bury the actionable rot.
Similarly `CONTROLS_MOVED_SINCE` requires an ASSESSED residual —
an unassessed one is the RQ2-2 suggestion flow's job.

The loader (`getRiskStaleness`) is one pass over four batched
queries (register scan, score-event `groupBy _max`, link rows,
test-run `groupBy _max`) joined in memory — no per-risk reads.
Output is sorted rot-first (reason count, then assessment age).
Surfaced via `GET /risks/staleness` and a dashboard widget that
renders only when `staleCount > 0` — an all-fresh register stays
quiet.

## Files

| File | Role |
| --- | --- |
| `src/lib/risk-staleness.ts` | Pure detector + `describeStaleness` |
| `src/app-layer/usecases/risk-staleness.ts` | Batched loader |
| `src/app/api/…/risks/staleness/route.ts` | GET-only report |
| `…/risks/dashboard/page.tsx` | Stale-assessments widget (top-10 + overflow count) |
| `tests/unit/risk-staleness*.test.ts` | Detector + loader suites |
| `tests/guards/rq2-8-staleness.test.ts` | No-noise contract + batching + GET-only ratchet |

## Decisions

- **Provenance ledger as the freshness clock.** `lastAssessedAt`
  comes from RQ2-1's `RiskScoreEvent` max, not `Risk.updatedAt` —
  a status flip or title edit must not reset the assessment clock.
- **180-day ceiling as a named constant**, not config. Per-tenant
  configurability can land later on `TenantSecuritySettings` if
  asked for; a hardcoded honest default beats a config surface
  nobody sets.
- **No background job.** The report recomputes per call from live
  timestamps; there is no state to materialise, so a cron would
  only add a cache to go stale (ironic for this feature).

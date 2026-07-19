# 2026-07-19 — Audit-readiness plumbing correctness

**Commit:** `<pending> fix(readiness): scope NIS2 self-assessment, split compute/persist, uniform axis permission, trend first-paint`

## Design

Four correctness bugs in the audit-readiness scoring plumbing, each
independent:

1. **NIS2 self-assessment double-counting.** `countOpenCycleFindings`
   OR-folded the tenant-wide NIS2 gap findings
   (`auditId: null, sourceKind = NIS2_SELF_ASSESSMENT`) into *every*
   NIS2 cycle's issue count. Two NIS2 cycles therefore penalised
   themselves identically for the same gaps. **Decision:** the NIS2
   self-assessment is genuinely tenant-wide (`Nis2SelfAssessment` is
   keyed by `tenantId` only — there is no per-cycle self-assessment),
   so it is attributed to exactly ONE canonical cycle: the **oldest
   NIS2 cycle** (`getCanonicalNis2CycleId`, `createdAt asc`). Only that
   cycle folds the self-assessment; a second NIS2 cycle counts only its
   own fieldwork findings. Fieldwork findings are always scoped by
   `audit.auditCycleId`, so they are unaffected.

2. **Readiness-snapshot write-amplification.** `computeReadiness`
   persisted a `ReadinessSnapshot` (and logged `READINESS_COMPUTED`) on
   *every* call, and the overview fanned it over every cycle on each
   list visit + every export. The trend chart filled with near-identical
   points that reflected page traffic, not readiness movement. **Split
   read from write:**
     - `scoreReadiness(ctx, cycleId)` — the compute-only core. No
       snapshot, no event. Used by the overview fan-out and all three
       export/pack paths.
     - `computeReadiness(ctx, cycleId)` — the deliberate-scoring path
       (the single-cycle readiness route). Wraps `scoreReadiness` and
       persists, but **dedupes**: skip the write + event when the
       cycle's most recent snapshot already holds this score. The trend
       now records real movement only.

3. **Non-uniform overview permission.** The overview's maturity axis
   fetched `/audits/nis2-gap`, whose usecases asserted
   `assertCanManageOnboarding` — stricter than the `assertCanViewPack`
   on the coverage + test axes — so a pack-viewer silently saw a
   2-axis view. **Relaxed the two NIS2 readiness READS**
   (`computeNis2Readiness`, `listNis2ReadinessSnapshots`) to
   `assertCanViewPack`, uniform with the other axes (a maturity score is
   a view-appropriate readiness signal). The self-assessment WRITE paths
   keep `assertCanManageOnboarding`; `snapshotNis2Readiness` — which had
   been borrowing its authorization from the now-relaxed read — was given
   its own explicit `assertCanManageOnboarding` gate so a viewer can
   never persist a snapshot.

4. **Trend first-paint race.** `readiness/page.tsx` fetched
   `?action=history` in the same `Promise.all` as the snapshot-writing
   default fetch, so the just-computed point could be missing from the
   chart on first paint. The client now merges the freshly-computed
   `result.score` in as the trailing trend point (belt-and-suspenders
   alongside the dedup) — deduping when history already ends on that
   score.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/audit-readiness-scoring.ts` | `getCanonicalNis2CycleId` helper + cycle-scoped NIS2 fold (bug 1); `scoreReadiness` compute-only core + `computeReadiness` persist-with-dedup (bug 2) |
| `src/app-layer/usecases/audit-readiness/overview.ts` | Fan-out switched to compute-only `scoreReadiness` (bug 2) |
| `src/app-layer/usecases/nis2-readiness.ts` | Two reads relaxed to `assertCanViewPack`; `snapshotNis2Readiness` given explicit manage-onboarding gate (bug 3) |
| `src/app/t/[tenantSlug]/(app)/audits/cycles/[cycleId]/readiness/page.tsx` | Merge current score into the trend series (bug 4) |
| `tests/guardrails/audit-s5-readiness-scoring.test.ts` | Ratchet the compute/persist split + dedup |

## Decisions

- **One canonical NIS2 cycle, not per-cycle self-assessment.** The
  data model has no per-cycle NIS2 self-assessment, so inventing a
  cycle linkage would be fiction. Folding tenant-wide gaps into the
  oldest NIS2 cycle keeps the penalty counted exactly once and is
  deterministic. A tenant that runs two NIS2 audit cycles sees the
  self-assessment reflected in the first; the second scores its own
  fieldwork only.
- **Deliberate scoring = visiting the single-cycle readiness route.**
  That is the one place a snapshot is written, deduped by score. The
  overview, list, exports, and pack embedding all compute-only. The
  dedup makes repeated visits with no movement free.
- **Relax the read, not add a placeholder.** The maturity score is a
  readiness signal a viewer should see; hiding it behind manage-onboarding
  was the accident, not the intent. The write paths stay gated.
- **`snapshotNis2Readiness` gets its own gate.** It previously relied on
  `computeNis2Readiness`'s assertion; relaxing that read would have
  silently let a viewer persist a snapshot, so the writer's gate is now
  explicit and independent.

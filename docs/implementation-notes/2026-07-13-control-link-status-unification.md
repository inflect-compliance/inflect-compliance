# 2026-07-13 — Control link-model + status-vocabulary unification (R2-P1)

**Commit:** _(R2-P1 of the controls-posture roadmap)_

## Design

Two data-model fractures silently broke control posture across **every**
framework the platform ships (~15: ISO 27001/27701/42001, SOC 2, NIST
CSF/SSDF, CIS, DORA, NIS2, GDPR, EU AI Act, …). The universal posture surface
is per-framework coverage/readiness; the ISO SoA is one ISO-family consumer of
the same rollup. Both fractures were correctness bugs, not polish.

### Fracture 1 — two control↔requirement link models

`controlRequirementLink` is canonical: read by ~20 posture surfaces (SoA,
per-framework coverage + readiness, audit-readiness, NIS2 gap,
compliance-posture, cloud/AWS posture, BIA, traceability, …) and written by the
framework install wizard + the SoA map route. `FrameworkMapping` was a parallel
**island**: written only by `control/templates.ts` (the template-library
install + the manual map/unmap), read only by the control-detail Mappings tab
and one dead `getCoverage`. It even lacks a `tenantId` column.

So a control installed the *discoverable* way (template library) wrote
`FrameworkMapping` rows that **no posture surface reads** → it rendered as
unmapped and never moved any framework's coverage/readiness.

Fix: route the entire island onto `controlRequirementLink`.
- `installControlsFromTemplate` writes `controlRequirementLink` (upsert) +
  unified `Task` (not legacy `controlTask`).
- `mapRequirementToControl` / `unmapRequirementFromControl` write/delete
  `controlRequirementLink` (so manual mapping also counts).
- The Mappings-tab reader (`ControlRepository.listFrameworkMappings`) and the
  dead `FrameworkRepository.getCoverage` read `controlRequirementLink`; the
  reader maps rows back to the existing `FrameworkMappingDTO` shape so the tab
  UI is untouched.
- A data migration backfills a `controlRequirementLink` for every existing
  `FrameworkMapping` that targets a control (deriving `tenantId` from the
  control). Idempotent; requirement→requirement mappings are left untouched.

### Fracture 2 — divergent control-status vocabularies

The Prisma `ControlStatus` enum has 7 members. The surfaces disagreed: list =
7, bulk = 7, detail dropdown = **4** (PLANNED/IMPLEMENTING/NOT_APPLICABLE
unreachable), SoA rollup = **5** (its private `STATUS_ORDER` silently dropped
PLANNED + IMPLEMENTING from `worstStatus`, so a control in either state
contributed *nothing* to its requirement's rollup). Per-framework coverage
computed no per-requirement verdict at all.

Fix: one shared rollup helper
`src/lib/compliance/requirement-status-rollup.ts` owns the canonical status set
+ `STATUS_ORDER` + `worstStatus` + `isImplemented`.
- `soa.ts` imports it (its private map is gone).
- `framework/coverage.ts` readiness now computes a per-requirement verdict via
  the same helper (`implementedRequirements` / `gapRequirements`), so every
  framework's readiness recognises the full vocabulary and matches the SoA.
- The detail dropdown reuses `buildControlStatusLabels` (the list's canonical
  i18n source) minus NOT_APPLICABLE (set via the applicability action), so all
  six non-NA statuses are selectable.

### Steering

The Controls empty-state primary CTA now points at the framework install
wizard (`/frameworks`) — the path that writes `controlRequirementLink` and
feeds every framework's posture — with the raw template library as the
secondary escape hatch.

## Decisions

- **Backfill, don't delete.** The migration inserts canonical links but leaves
  the legacy `FrameworkMapping` rows in place (nothing reads them anymore).
  Deletion is irreversible and unnecessary; a follow-up can drop the model.
- **`worstStatus` ordering.** `NOT_STARTED < PLANNED < IN_PROGRESS <
  IMPLEMENTING < NEEDS_REVIEW < IMPLEMENTED`; only IMPLEMENTED counts as
  covered (preserves the prior SoA semantics while slotting in the two dropped
  states). NOT_APPLICABLE is -1 (excluded, not a gap).
- **Shared helper in `src/lib/compliance`.** Pure, DB-free, unit-testable; the
  seam P5 extends with the `EXCEPTED` verdict so it flows to all frameworks.

## Files

| File | Role |
|---|---|
| `src/lib/compliance/requirement-status-rollup.ts` | NEW — canonical status set + worstStatus |
| `src/app-layer/usecases/soa.ts` | uses shared rollup; open-task count → unified Task |
| `src/app-layer/usecases/framework/coverage.ts` | per-requirement verdict via shared rollup |
| `src/app-layer/usecases/control/templates.ts` | install + map/unmap → controlRequirementLink + Task |
| `src/app-layer/repositories/ControlRepository.ts` | Mappings-tab reader → controlRequirementLink; header count |
| `src/app-layer/repositories/FrameworkRepository.ts` | dead getCoverage → controlRequirementLink |
| `src/app-layer/usecases/control/queries.ts` | header Mappings badge count from canonical links |
| `.../controls/[controlId]/page.tsx` | detail status dropdown = canonical 6 |
| `.../controls/ControlsClient.tsx` | empty-state CTA → framework wizard |
| `prisma/migrations/20260713140000_backfill_control_requirement_links/` | backfill |
| `tests/guards/control-posture-invariants.test.ts` | ratchet (a) one link table (b) one status set |

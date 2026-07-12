# 2026-07-12 — Risk lifecycle: one guided create → assess → treat → monitor → status path

**Commit:** _(P1 of the risk-domain roadmap)_

## Design

The risk **detail** page had a good guided assessment (inherent → controls
→ residual in `RiskAssessmentPanel`) but the rest of the lifecycle scattered:
the treatment decision lived in the Edit modal, the structured treatment
plan sat on a separate Overview card with a dead owner CTA, the review
cadence was buried, and the header status combobox floated free of the
assessment state. Two treatment vocabularies (`Risk.treatment` =
TREAT/TRANSFER/TOLERATE/AVOID vs `RiskTreatmentPlan.strategy` =
MITIGATE/ACCEPT/TRANSFER/AVOID) named the same decision.

This change makes it ONE process:

- **Step 4 — Treat & monitor** is added to `RiskAssessmentPanel`, continuing
  directly from residual: choose the treatment decision, set the review
  cadence, see a guided next-status recommendation, and manage the
  structured treatment plan — all without leaving the assessment. The plan
  card is **relocated** from Overview into Step 4 so the whole lifecycle
  lives in one narrated path (Overview keeps a read-only treatment summary
  plus a pointer to the flow).
- **One canonical vocabulary.** `@/lib/risk-treatment-vocabulary` is the
  single source of truth: the canonical labels are the ISO-current
  `TreatmentStrategy` words (Mitigate / Accept / Transfer / Avoid), and the
  decision↔strategy map (TREAT↔MITIGATE, TOLERATE↔ACCEPT) is defined once.
  Every display site — detail Overview, guided Step 4, Edit modal, the risk
  list column, and the report/PDF projection — now reads the same words.
- **Guided status.** Step 4 recommends the next workflow status from the
  assessment + treatment state (residual assessed? decision made? →
  MITIGATING for TREAT/TRANSFER/AVOID, ACCEPTED for TOLERATE) with a one-tap
  apply, and notes that final status is set automatically at plan
  completion (the existing backend strategy→status mapping:
  MITIGATE→MITIGATED, ACCEPT→ACCEPTED, TRANSFER/AVOID→CLOSED).
- **Owner CTA fixed.** The treatment-plan owner picker was `ownerChoices={[]}`
  — the required combobox was unfillable, so no plan could be created. The
  tenant roster is already loaded on the page (`useTenantMembers`); it is
  now mapped into `ownerChoices`.

## Decisions

- **No enum migration.** "Collapse to one field" is satisfied at the
  vocabulary layer, not the column layer: the persisted `Risk.treatment`
  enum VALUES are unchanged (enum-valid, no destructive prod migration, no
  backfill); only the presented LABELS are unified, plus the explicit
  decision↔strategy map. A physical column merge is a documented follow-up
  that would need a schema migration + second sign-off per
  change-management. This keeps the change reversible (pure app-layer +
  UI) while meeting the acceptance criterion "exactly one treatment
  vocabulary" everywhere a user reads it.
- **Vocabulary lives in `src/lib`**, not the route `_shared` folder, so the
  app-layer report projection can import it without a layer violation;
  `_shared/risk-options.ts` re-exports it and adds the i18n-aware helpers.

## Files

| File | Role |
|---|---|
| `src/lib/risk-treatment-vocabulary.ts` | NEW — single source of truth: types, decision↔strategy map, EN labels |
| `src/app/t/[tenantSlug]/(app)/risks/_shared/risk-options.ts` | Re-exports the lib module; i18n option/label helpers |
| `src/app/t/[tenantSlug]/(app)/risks/[riskId]/RiskAssessmentPanel.tsx` | Step 4 (treat & monitor): decision + cadence + guided status + relocated plan card |
| `src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx` | Passes Step 4 props + real `ownerChoices`; removes Overview plan card; canonical treatment label |
| `src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx` | List treatment column reads the canonical label |
| `src/app-layer/usecases/report.ts` | Report projection uses the canonical EN label |
| `messages/{en,bg}.json` | Canonical treatment labels + Step 4 copy |
| `tests/guards/p1-risk-lifecycle-unification.test.ts` | Ratchet: vocabulary map, canonical options, Step 4 wiring, live owner roster |

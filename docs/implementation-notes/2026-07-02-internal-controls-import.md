# 2026-07-02 — Internal Controls library import

**Commit:** `<pending>` feat(controls): import internal controls library + objective/success-criteria/testing-methodology

## What

Imported **151 deduped internal controls** from a customer GRC-tool CSV export
into IC's controls library, and surfaced three new per-control fields on the
control detail page.

- **Fixture** `prisma/fixtures/internal-controls.json` — generated from 151 CSV
  files (263 rows, deduped by control name → 151 unique). Field mapping from the
  source: `Description → objective`, `Audit Success Criteria → successCriteria`,
  `Audit Methodology → testingMethodology`, `Related Policies → relatedPolicies`.
- **Global ControlTemplate library** (the chosen target): seeded as
  `ControlTemplate` rows (`ICN-001…151`) under a CUSTOM `Internal Controls`
  container framework + an installable `INTERNAL_CONTROLS` pack. Rides the
  generic `FrameworkPack` / `installPack` machinery.
- **New fields** on `Control` (objective, successCriteria, testingMethodology)
  and `ControlTemplate` (those three + relatedPolicies), via migration
  `20260702110000_internal_controls_fields`. `installPack` copies the three onto
  the Control so they render post-install.
- **Control detail UI**: the Overview tab now leads with **Objective** (was
  Description) and **Success Criteria** (was Intent), each falling back to the
  legacy field; the Tests tab shows a **Testing Methodology** block above the
  Test plans section.

## Decisions

- **Global ControlTemplate library, not per-tenant Controls** (operator choice):
  the set is reusable and installable by any tenant. A CUSTOM container framework
  is used only because `FrameworkPack.frameworkId` is required — it is not a
  compliance framework mapping.
- **Framework mapping deferred** (operator choice): the source export's `Tags`
  column was empty, so there is no framework signal to map from. Policy names ARE
  in the source (`Related Policies`) and are carried on the template
  (`relatedPolicies`) for per-tenant resolution; deriving ISO 27001 / NIS2
  requirement links is a follow-up.
- **Objective/Success Criteria reuse the display slots of Description/Intent**
  with a fallback, per the request ("objective instead of description, success
  criteria instead of intent"). `testingMethodology` is a genuinely new field
  (there was no equivalent).
- **DTO + snapshot**: `ControlDetailDTOSchema` gained the three fields;
  `public/openapi.json` + the `ControlDetail` contract snapshot were regenerated.

## Follow-ups

- Resolve `relatedPolicies` to real `PolicyControlLink` rows on install (per-
  tenant, by policy name).
- Derive framework-requirement mappings (ISO 27001 Annex A / NIS2) for the set.
- Optionally expose the three fields in the control edit form (currently
  import/display only).

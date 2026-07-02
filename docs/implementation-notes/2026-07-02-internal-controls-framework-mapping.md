# 2026-07-02 — Internal Controls: policy-mediated framework mapping

**Commit:** `<pending>` feat(controls): internal controls as framework-mapped templates (not a pack)

Supersedes the pack/framework model from
[2026-07-02-internal-controls-import.md](2026-07-02-internal-controls-import.md).
That note landed the 151-control import as a standalone `INTERNAL_CONTROLS`
pack under a CUSTOM `Internal Controls` framework. Per operator direction the
internal controls "should not be a pack — they are a set of controls mapped to
frameworks and policies; installing a framework pack should also populate the
mapped controls + tasks + policies." This note records that re-architecture and
the three follow-ups from the prior note.

## What changed

1. **No more standalone pack/framework.** The CUSTOM `INTERNAL-CONTROLS`
   framework and `INTERNAL_CONTROLS` pack are gone. The 151 controls seed as
   plain global `ControlTemplate` rows (`ICN-001…151`) with no pack link.

2. **Policy-mediated framework mapping.** Each control carries its exact related
   policy names from the source (`relatedPolicies`). A curated
   `prisma/fixtures/internal-controls-policy-framework-map.json` maps each of the
   22 distinct policies → ISO 27001 Annex A codes + NIS2 article codes. The seed
   resolves, per control, the union of its policies' requirement codes into
   `ControlTemplateRequirementLink` rows (against the real ISO 27001 + NIS2
   framework requirements). Result: 140/151 controls get ≥1 framework link; 0
   dangling codes.

3. **Install populates mapped internal controls.** `installPack` now, after
   loading the pack's own templates, also queries every `ControlTemplate` whose
   `requirementLinks` reference `pack.frameworkId` (excluding the pack's own
   templates) and installs those too — control + tasks + requirement links. So
   installing the ISO 27001 or NIS2 pack pulls in exactly the internal controls
   that map to that framework, and nothing that doesn't.

4. **Related policies → PolicyControlLink on install.** A `linkPolicies` helper
   builds a tenant-policy-by-title map and, for each installed control, resolves
   the `|`-joined `relatedPolicies` names to the tenant's matching `Policy` rows,
   creating `PolicyControlLink` rows (`skipDuplicates`, never creates a policy).
   `policyLinksCreated` is threaded through the audit event + return value.

5. **Edit form exposes the three fields.** `objective`, `successCriteria`, and
   `testingMethodology` are now editable textareas in `EditControlModal` (were
   import/display-only), wired through `UpdateControlSchema` → `updateControl` →
   the control repository. `public/openapi.json` + the `ControlUpdateRequest`
   contract snapshot regenerated.

## Files

| File | Role |
| --- | --- |
| `prisma/fixtures/internal-controls-policy-framework-map.json` | NEW — curated 22-policy → ISO 27001 + NIS2 requirement-code map |
| `prisma/seed.ts` | Internal-controls block rewritten: no framework/pack; policy-mediated `ControlTemplateRequirementLink` seeding |
| `src/app-layer/usecases/framework/install.ts` | `installPack` also installs framework-mapped internal controls + resolves related policies to `PolicyControlLink` |
| `src/lib/schemas/index.ts` | `UpdateControlSchema` gains the three fields |
| `src/app-layer/usecases/control/mutations.ts` | `updateControl` accepts + forwards the three fields |
| `.../controls/[controlId]/page.tsx` | edit form state + save payloads carry the three fields |
| `.../controls/[controlId]/_modals/EditControlModal.tsx` | three new textareas |
| `tests/guardrails/internal-controls-coverage.test.ts` | pack/framework assertions replaced with policy-map + install-population assertions |

## Decisions

- **Policy-mediated over heuristic mapping** (operator choice via AskUserQuestion):
  the source has no framework tags, but exact policy names are present. A curated
  policy→framework map gives clean, auditable coverage (140/151) versus a noisy
  keyword heuristic (112/151, over-mapping A.5.36). The map is small (22 policies)
  and human-reviewable.
- **Scope = "only the frameworks the controls apply to."** The map targets ISO
  27001 + NIS2 (the frameworks the internal-control policies actually speak to),
  not all installed frameworks. A control with no mapped policy simply gets no
  framework link and installs only when directly requested.
- **Install-time population keyed on `frameworkId`**, not a hardcoded framework
  list — any future framework whose requirements get mapped in the policy map
  automatically pulls its internal controls on pack install.
- **Preview undercounts internal controls.** `previewPackInstall` still reports
  only the pack's own templates; the mapped-internal population shows up at
  install time. Acceptable — preview is an estimate, install is authoritative.

# 2026-05-24 — B8 follow-up: evidence folders

**Commit:** `<sha> feat(b8-followup): evidence folders — parity with VendorDocument`

## Design

The original B8 (#697) added `folder` to `VendorDocument` and called
the bundle "Folders + framework lifecycle". The user's feedback
("evidence still can't be organized to folders?") was correct — the
roadmap item said "Introduce document folders" and evidence is the
bigger documents surface. This follow-up brings parity.

The shape mirrors `VendorDocument.folder` end-to-end:

  • `Evidence.folder String?` + `(tenantId, folder)` index.
  • `CreateEvidenceSchema` + `UpdateEvidenceSchema` both accept the
    field with a 120-char cap.
  • `createEvidence` + `updateEvidence` + `uploadEvidenceFile`
    usecases trim + null-coerce so empty input maps to "no
    folder" (the group-by code keys on null, never `""`).
  • `EvidenceRepository._buildWhere` resolves the `__none__`
    sentinel to a `folder IS NULL OR folder = ''` predicate so
    legacy unfoldered rows stay findable after rollout.
  • Filter chain: `EvidenceQuerySchema` accepts `folder`, the GET
    route threads it into the filters object, the filter-defs
    module builds runtime options from the loaded evidence.
  • UI: New (TEXT) evidence modal, Upload modal, and Edit modal
    all carry a Folder input. The list page shows a Folder column
    (column-visibility gear keeps it discoverable). A shared
    `<datalist id="evidence-folder-suggestions">` mounted on
    EvidenceClient drives autocomplete in both create modals.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | `Evidence.folder` + index |
| `prisma/migrations/20260524190000_b8_evidence_folder/migration.sql` | hand-written DDL |
| `src/lib/schemas/index.ts` | `CreateEvidence` + `UpdateEvidence` folder field |
| `src/app-layer/usecases/evidence.ts` | create + update + upload accept folder |
| `src/app-layer/repositories/EvidenceRepository.ts` | filter + select shape |
| `src/app/api/t/[tenantSlug]/evidence/route.ts` | EvidenceQuerySchema.folder |
| `src/app/api/t/[tenantSlug]/evidence/uploads/route.ts` | FormData → metadata.folder |
| `src/app/t/[tenantSlug]/(app)/evidence/filter-defs.ts` | Folder filter def + runtime options |
| `src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx` | Folder column + datalist + filter wiring |
| `src/app/t/[tenantSlug]/(app)/evidence/NewEvidenceTextModal.tsx` | Folder input |
| `src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx` | Folder input + FormData wire |
| `src/app/t/[tenantSlug]/(app)/evidence/EditEvidenceModal.tsx` | Folder input + PATCH body |
| `src/app/t/[tenantSlug]/(app)/evidence/EvidenceDetailSheet.tsx` | forward folder to onEdit |
| `tests/guardrails/b8-followup-evidence-folders.test.ts` | 24 structural assertions |

## Decisions

* **`__none__` sentinel matches both NULL and empty string.**
  VendorDocument's folder filter used `__none__` for NULL only;
  Evidence widens it to NULL-or-empty so a future bug that wrote
  `""` instead of NULL doesn't make the row invisible to the
  filter. Cheap defence-in-depth.

* **Three-state contract on update.** `updateEvidence` honours
  `undefined → skip`, `null → clear`, `string → set`. The
  Edit modal sends `folder.trim() || null` so clearing the
  input is an explicit "unfile" gesture.

* **Folder column hidden behaviour deferred.** The DataTable
  primitive's column-visibility dropdown doesn't carry
  `defaultHidden` today; the Folder column ships visible.
  Tenants who don't use folders see em-dashes — not ideal but
  harmless. A future column-vis enhancement can flip the
  default; the column key is already in `evidenceColumnList`.

* **Datalist is global, mounted once on EvidenceClient.** Both
  create modals (`list="evidence-folder-suggestions"`) reference
  the single source of truth derived from the currently-loaded
  evidence rows. Avoiding per-modal datalists prevents the two
  forms from drifting on their suggestion sets.

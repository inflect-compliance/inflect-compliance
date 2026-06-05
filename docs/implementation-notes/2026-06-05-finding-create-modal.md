# 2026-06-05 — Create-finding modal + Finding relations

**Commit:** `<sha>` feat(findings): create-finding modal with assignee, controls, risks, analysis

## Design

The findings list had a thin inline create form (title, severity, type,
free-text owner, description, due date). This adds a proper
`<CreateFindingModal>` and the data model behind it: an **assignee**
(tenant member), a **linked control**, a **compensating control**,
**many implicated risks**, and a free-text **analysis** field.

```
Finding (new columns)            FindingRisk (new junction)
  assigneeUserId → User            findingId ─┐ composite FK → Finding(id,tenantId)
  controlId → Control (SET NULL)   riskId   ─┘ composite FK → Risk(id,tenantId)
  compensatingControlId → Control  tenantId → Tenant
  analysis (encrypted)             (RLS: tenant_isolation trio, like FindingEvidence)
```

The modal mirrors `NewRiskModal`: `Modal` + `FormField`/`FormSection`,
`Combobox` for type/severity/control/compensating-control, `UserCombobox`
for assignee, `DatePicker` for due date, a searchable checkbox list for
risks, and `Textarea` for description + analysis. It POSTs the full shape
to the existing `/api/t/:slug/findings`.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | Finding scalars + relations; `FindingRisk` junction; Control/Risk reverse relations. |
| `prisma/schema/auth.prisma` | `User.assignedFindings`, `Tenant.findingRisks`. |
| `prisma/migrations/20260605200000_finding_create_modal_relations/` | Columns, junction, FKs, indexes, RLS. |
| `src/lib/security/encrypted-fields.ts` | `analysis` added to the Finding manifest. |
| `src/app-layer/repositories/FindingRepository.ts` | list + getById hydrate the new relations. |
| `src/app-layer/usecases/finding.ts` | `validateFindingRefs` (tenant check) + create/update write the new fields & risk links. |
| `src/lib/schemas/index.ts` | Create/Update schemas gain the fields; status enum bug fixed. |
| `src/app/t/[tenantSlug]/(app)/findings/CreateFindingModal.tsx` | The modal. |
| `src/app/t/[tenantSlug]/(app)/findings/FindingsClient.tsx` | inline form → modal. |

## Decisions

- **Assignee is a real User FK** (`assigneeUserId`, `"FindingAssignee"`
  relation), not the legacy free-text `owner` — which stays on the model
  for back-compat but is dropped from the modal.
- **`FindingRisk` copies the `FindingEvidence` junction shape** —
  composite parent FKs to `(id, tenantId)` so both sides provably share
  the row's tenant; the same RLS trio + indexes.
- **Control refs use a simple FK + `SET NULL`** (not composite) because a
  composite FK with `ON DELETE SET NULL` can't null a non-nullable
  `tenantId`. The usecase validates tenant ownership; both control refs
  are checked in ONE `findMany` (no N+1).
- **`riskIds` is a full replace on update** (undefined = leave untouched).
- **Latent bug fixed:** `UpdateFindingSchema` accepted `RESOLVED`, which
  isn't in the `FindingStatus` enum (`READY_FOR_VERIFICATION`) — the list
  page's "Ready for verification" transition was silently 400ing. Now
  matches the enum.

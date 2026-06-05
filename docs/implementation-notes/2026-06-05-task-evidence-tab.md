# 2026-06-05 — Task Evidence tab + overview edit modal

**Commit:** _(pending)_ feat(tasks): control-parity Evidence tab, overview edit modal, evidence→task back-reference

## Design

Three task-detail improvements, all mirroring the control detail page so
the two surfaces read as siblings:

1. **Task Evidence tab (control parity).** The task detail page now has a
   real **Evidence** tab that looks + behaves exactly like the control
   Evidence tab: a `+ Add Evidence` affordance that either uploads a file
   OR links a URL, rendered through the *same* shared `EvidenceSubTable`.
   Whatever is attached is scoped to the open task. The previous
   `Evidence`-labelled tab (which actually listed generic entity *links*)
   was renamed **Links** and kept as-is.

2. **Overview edit modal.** An icon edit button on the Overview tab opens
   an `EditTaskModal` (title / description / type / severity / priority /
   due date → `PATCH /tasks/{id}`), mirroring the control `EditControlModal`
   pattern (page owns state + mutation, modal is a thin renderer). Status
   and assignee keep their existing dedicated controls.

3. **Evidence → source-task back-reference.** Evidence uploaded from a
   task records its origin; the evidence detail sheet shows an **"Uploaded
   from task"** row linking back to that task.

### Data model

A single nullable column carries all three:

```
Evidence.taskId  String?   FK → Task.id   ON DELETE SET NULL
                 @@index([tenantId, taskId])
```

Mirrors the existing `Evidence.controlId` shape exactly. **No new link
table** — unlike controls (which carry a `ControlEvidenceLink` bridge),
tasks attach `Evidence` entities directly via `taskId`. The shared
`EvidenceSubTable` renders the same `{ links, evidence }` payload; for
tasks `links` is always empty and the `evidence` rows carry the data.
This keeps the migration to one additive column on an already-RLS'd
table (no new RLS policy needed) and makes the back-reference intrinsic
(`Evidence.taskId` → task) rather than derived.

### Flow

- **Upload** → `POST /evidence/uploads` (multipart) now accepts a `taskId`
  field; `uploadEvidenceFile` validates the task is in-tenant and stamps
  `Evidence.taskId`.
- **URL link** → `POST /tasks/{id}/evidence` → `linkTaskEvidence` creates
  a `LINK`-type Evidence row (`content` = url) tagged with the task.
- **List** → `GET /tasks/{id}/evidence` → `getTaskEvidenceTab` returns
  `{ links: [], evidence }`.
- **Remove** → `DELETE /tasks/{id}/evidence/{evidenceId}` →
  `unlinkTaskEvidence` clears `taskId` (the Evidence survives in the
  library, mirroring control evidence unlink semantics).

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` + `migrations/20260605130000_evidence_task_id/` | `Evidence.taskId` FK + index; `Task.evidence` reverse relation. |
| `src/app-layer/usecases/task.ts` | `getTaskEvidenceTab` / `linkTaskEvidence` / `unlinkTaskEvidence`. |
| `src/app-layer/usecases/evidence.ts` + `evidence/uploads/route.ts` | `uploadEvidenceFile` accepts + validates `taskId`. |
| `src/app/api/.../tasks/[taskId]/evidence/{route,[evidenceId]/route}.ts` | GET/POST + DELETE routes. |
| `src/app-layer/repositories/EvidenceRepository.ts` + `WorkItemRepository.ts` | evidence `getById` includes `task`; task `_count.evidence`. |
| `.../tasks/[taskId]/page.tsx` | Evidence tab + edit button/modal wiring; Links tab rename. |
| `.../tasks/[taskId]/_modals/EditTaskModal.tsx` | new edit modal (FormField-based). |
| `.../controls/[controlId]/_tabs/EvidenceSubTable.tsx` | opt-in `onUnlinkEvidence` + LINK-URL href; control behaviour unchanged. |
| `.../evidence/EvidenceDetailSheet.tsx` | "Uploaded from task" back-reference row. |

## Decisions

- **`Evidence.taskId`, not a `TaskEvidenceLink` model.** One additive
  nullable column vs. a whole new tenant-scoped model (migration + RLS
  policy + repo + the DB-backed RLS-coverage guardrail). The column also
  *is* the back-reference, so requirement #3 falls out for free.
- **Shared `EvidenceSubTable` stayed under `controls/[controlId]/_tabs/`.**
  It's genuinely shared now and `@/components/` would be the textbook
  home, but three guard exemption maps + a unit test key off the current
  path; relocating churns four test files for no behavioural gain. The
  task page imports it via the `@/app/...` alias instead, and the
  control page is untouched.
- **Direct-evidence removal is opt-in (`onUnlinkEvidence`).** The control
  Evidence tab keeps its direct Evidence read-only (no prop passed); only
  the task tab — where every row is task-attached — gets remove buttons.
  Zero behaviour change for controls.

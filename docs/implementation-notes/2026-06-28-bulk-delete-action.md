# 2026-06-28 — Bulk delete in the row-select action bar

**Commit:** `<sha> feat(tables): bulk Delete action (with confirm) for the 8 list entities`

## Design

Every entity with a table row-select action bar — assets, risks, controls, tasks,
control test plans, evidence, policies, vendors — gets a **Delete** bulk action
that soft-deletes the selected rows, gated by a confirmation dialog.

- **Confirm is centralised in `BulkActionBar`.** A `BulkActionDef` gains an
  optional `confirm?: { confirmLabel? }`; when present, the bar routes Apply
  through a danger-tone `Modal.Confirm` ("Delete N {entityLabel}?") before firing
  `onApply`. The bar takes `selectedCount` + `entityLabel` props for the message.
  One implementation, eight pages — no per-page dialog wiring.
- **Soft delete, matching each entity's existing single-row delete.** The bulk
  usecases call `db.<model>.deleteMany(...)`, which the soft-delete middleware
  intercepts → `deletedAt` + `deletedByUserId` + a `SOFT_DELETE` audit row per
  record. Rows vanish from lists immediately and are hard-purged by the existing
  `data-lifecycle` job (90 days; evidence 365).
- **Permissions match the single-row delete** per entity: admin for asset / risk /
  control / evidence / policy; `assertCanWriteTasks` for tasks;
  `assertCanManageVendors` / `assertCanManageTestPlans` for vendor / test plan
  (which had no single-row delete before).

## Decisions

- **ControlTestPlan needed soft-delete enrolment.** It was the only one of the 8
  not in `SOFT_DELETE_MODELS` and lacked a `deletedAt` column (and its runs FK has
  no cascade, so a hard delete would fail). Added `deletedAt` + `deletedByUserId`
  (migration `20260628120000_control_test_plan_soft_delete`) and enrolled it, so
  it soft-deletes consistently with the other seven.
- **Per-entity usecases, not a generic helper.** Matches the existing
  `bulkArchivePolicy` / `bulkAssignAsset` convention and keeps each
  `db.<model>.deleteMany` strongly typed (the `as any` ratchet forbids the dynamic
  alternative).
- **Confirm dialog, not undo-toast.** Epic 67's undo-toast is for single routine
  deletes; a bulk delete of N records warrants an explicit count confirmation (the
  user asked for one). Not added to the Epic-67 `SITE_CONTRACTS`. The confirmLabel
  "Delete" stays on the canonical destructive-verb vocabulary.

## Files

| File | Role |
|------|------|
| `src/components/ui/bulk-action-bar.tsx` | `confirm` field + `selectedCount`/`entityLabel` props + the `Modal.Confirm` dialog. |
| `src/app-layer/usecases/{asset,risk,control/mutations,task,evidence,policy,vendor,control-test}.ts` | `bulkDelete<Entity>` usecases. |
| `src/app/api/t/[tenantSlug]/<entity>/bulk/delete/route.ts` × 8 | bulk-delete routes. |
| `src/lib/schemas/index.ts` | 8 `Bulk<Entity>DeleteSchema`. |
| `src/app/t/[tenantSlug]/(app)/.../*Client.tsx` (+ tests/page.tsx) | delete action + confirm props wired into each list page. |
| `prisma/schema/compliance.prisma` + migration + `src/lib/soft-delete.ts` | ControlTestPlan soft-delete enrolment. |
| `tests/guardrails/bulk-delete-coverage.test.ts` | ratchet over all of the above. |

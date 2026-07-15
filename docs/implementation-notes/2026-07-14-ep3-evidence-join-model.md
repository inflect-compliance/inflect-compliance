# 2026-07-14 — EP-3: evidence↔control join model

**Commit:** `<pending> feat(evidence): many-to-many evidence↔control join (EvidenceControlLink)`

## Design

Before EP-3, `Evidence` carried a singular `controlId String?`. Re-uploading the
same artifact to N controls cloned N independent `Evidence` rows — each with its
own status / review / retention. Root cause: the one-to-many FK.

EP-3 introduces `EvidenceControlLink` (`prisma/schema/evidence.prisma`), a
tenant-scoped junction between one `Evidence` and many `Control`s:

```
EvidenceControlLink { id, tenantId, evidenceId, controlId, createdByUserId?,
                      createdAt, updatedAt }
  evidence  → Evidence(id, tenantId)   composite FK, onDelete: Cascade  (chained RLS)
  control   → Control(id)              onDelete: Cascade
  @@unique([tenantId, evidenceId, controlId])
  @@index([tenantId, controlId])  @@index([tenantId, evidenceId])
```

The composite FK to `Evidence(id, tenantId)` (mirroring `EvidenceReview`) chains
RLS through the parent and makes a cross-tenant link structurally impossible.
`tenantId` is non-nullable → the canonical **split** RLS policy trio
(`tenant_isolation` USING + `tenant_isolation_insert` WITH CHECK +
`superuser_bypass`).

Creating evidence is now **one `Evidence` + N join rows** — no clone. The
usecases accept `controlIds: string[]`; a legacy singular `controlId` is wrapped
into `[controlId]` (`normalizeControlIds`) for backward compat.

### Scope: controls only

`taskId` / `riskId` / `assetId` stay as singular "uploaded from" back-refs. They
are a *different semantic* — provenance ("this evidence was uploaded from that
task's Evidence tab"), not a many-satisfies association — and have no
clone problem. Converting them is explicitly out of scope for this PR.

### Reconciling the dual representation

A separate `ControlEvidenceLink` (controls.prisma) linked a control to raw
artifacts (`fileId` / `url` / `integrationResultId` / `biaId`). A best-effort
"bridge" in `evidence.ts` *also* wrote a `ControlEvidenceLink` for every Evidence
entity so it showed in the control's Evidence tab — the dual representation.

EP-3 makes the **Evidence entity (via `EvidenceControlLink`) the single source of
truth** for evidence-entity↔control associations. The bridge writes are removed.
`ControlEvidenceLink` is **retained only for genuinely non-Evidence artifacts**
(url / integration result / BIA). The control detail Evidence tab
(`getControlEvidenceTab`) now reads Evidence via `evidenceControlLinks.some`, and
`EvidenceSubTable` drops the render-time `fileRecordId` dedup that compensated for
the dual representation.

### File-version lineage (Part 4)

`replaceEvidenceFile` uploads a new file → new `FileRecord` (chained to the prior
one via the new self-relation `FileRecord.previousFileRecordId`) → repoints
`Evidence.fileRecordId` and bumps `Evidence.fileVersion`, **preserving** the
Evidence row's status / reviews / retention / control links. Updating a doc keeps
lineage instead of spawning an unrelated row.

### Category surfaced (Part 5)

`Evidence.category` was persisted but shown/filtered nowhere. It is now a table
column, an exact-match list filter (`?category=`), a detail-sheet row, and an
editable create/edit field. No migration — the column already existed.

## Migration

`prisma/migrations/20260714180000_evidence_control_link/migration.sql` (forward-fix):

1. Add `Evidence.fileVersion` (default 1) + `FileRecord.previousFileRecordId`
   (self-FK, SET NULL) + its `[tenantId, previousFileRecordId]` index.
2. `CREATE TABLE EvidenceControlLink` + PK + unique + two tenantId-leading
   indexes + composite/regular FKs.
3. RLS: ENABLE + FORCE + `tenant_isolation` / `tenant_isolation_insert` /
   `superuser_bypass` (canonical split form; app_user grants inherited via
   ALTER DEFAULT PRIVILEGES).
4. Backfill: one link per currently-linked evidence
   (`SELECT ... FROM "Evidence" WHERE "controlId" IS NOT NULL`;
   `gen_random_uuid()::text` ids for backfilled rows).
5. Drop `Evidence.controlId` (+ its FK + `[tenantId, controlId]` index).

## Files

| File | Role |
|---|---|
| `prisma/schema/evidence.prisma` | New `EvidenceControlLink`; Evidence loses `controlId`/`control`, gains `evidenceControlLinks` + `fileVersion`; FileRecord gains version self-relation |
| `prisma/schema/controls.prisma` | Control: `evidence` → `evidenceControlLinks` |
| `prisma/schema/auth.prisma` | Tenant + User back-relations for the join |
| `prisma/migrations/20260714180000_evidence_control_link/migration.sql` | Table + RLS + backfill + drop |
| `src/app-layer/repositories/EvidenceRepository.ts` | Join-aware list/getById; link-management methods; category filter |
| `src/app-layer/usecases/evidence.ts` | `controlIds` create/upload/update; `linkEvidenceToControl` / `unlinkEvidenceFromControl` / `replaceEvidenceFile`; metrics + download gate via join |
| `src/app-layer/usecases/control/evidence.ts` | `getControlEvidenceTab` reads evidence via the join |
| `src/lib/schemas/index.ts` | `controlIds` on create/update; `LinkEvidenceControlSchema` |
| `src/lib/dto/evidence.dto.ts` | `evidenceControlLinks` + where-used refs |
| `src/app/api/.../evidence/[id]/controls/**`, `.../[id]/replace/route.ts`, `uploads`, `route.ts` | Link/unlink/replace routes; multi-control upload; category filter |
| `src/app/t/**/evidence/**` | Create menu, where-used list, link/unlink (undo-toast), multi-select edit, replace-file, category surface |
| Backend read/write reconciliation | scanner-ingestion, integrations, webhook-processor, aws/cloud-posture, automation-runner, control-test-runner, vendor-assessment-review, ControlRepository, MappingRepository, ReportRepository, inherited-control-data, soa, audit-readiness-*, framework/coverage, evidence-maintenance/-retention, evidence-expiry-monitor, retention-notifications |

## Decisions

- **Controls-only join.** risk/asset/task stay single-source provenance refs —
  different semantic, no clone problem. Noted so a future contributor doesn't
  "finish the job" by mistake.
- **Backward-compat `controlId`.** Kept accepting a singular `controlId` on
  create/upload (wrapped into the list) so existing callers/integrations
  (SharePoint import, scanners, automation) keep working unchanged.
- **`ControlEvidenceLink` retained.** Not deleted — it still models url /
  integration-result / BIA artifact links, which are not Evidence entities.
- **File-version chain via a self-relation** rather than a separate version
  table — the lineage is a simple linked list; `fileVersion` gives a cheap
  monotonic label without walking the chain.
- **`createdByUserId` nullable on the join** — system/synthetic contexts
  (webhook `'system:webhook'`, posture `'system'`) have no real User FK, so
  those backfill/create paths write `null` rather than violate the FK.

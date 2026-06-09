# 2026-06-09 — SharePoint evidence import (SP-3) — MVP complete

**Commit:** `<sha>` feat(integrations): SharePoint evidence import + delta sync (SP-3)

## Why

Completes the SharePoint MVP (SP-1 connect → SP-2 browse → **SP-3 import**):
practitioners import SharePoint files as evidence in one click, and a scheduled
delta sync auto-re-imports changed files.

## Design

- **`import.ts`** — file-oriented, NOT the field-mapper `BaseSyncOrchestrator`
  (that fits SP-4's bidirectional content sync, not file import):
  - `importSharePointItems` (manual) — per item: `getItem` → `downloadItemContent`
    → `new File([ab], name, {type})` → `uploadEvidenceFile` → upsert an
    `Evidence ↔ DriveItem` `IntegrationSyncMapping` (keyed on the remote id;
    re-import re-points it). Capped at `SP_IMPORT_MAX_ITEMS` (20), per-item
    errors isolated.
  - `runSharePointDeltaSync` (scheduled) — load this connection's mappings,
    walk `getDelta` per drive from the stored token; changed (`eTag` differs) →
    re-import, deleted → mark `STALE`; persist the new delta token per drive on
    the connection config.
- **BullMQ** — `sharepoint-delta-sync` (one connection; builds a tenant context
  from an active-admin actor) + `sharepoint-delta-sync-dispatch` (daily cron,
  fans out one sync per enabled connection). On-demand via the `sync` route.
- **Routes** (`evidence.upload`): `import` (synchronous), `sync` (enqueue +
  jobId), `connections` (practitioner-readable connection list for the picker).
- **Schema** — `IntegrationSyncMapping.sourceUrl` (provider-agnostic remote URL).
- **Wiring** — the evidence `UploadEvidenceModal` gains an "Import from
  SharePoint" button (shown only when a connection exists) that opens the SP-2
  picker; on confirm it POSTs `import` and refreshes the evidence list.

## Decisions

- **File import is its own service, not `BaseSyncOrchestrator`.** The base
  orchestrator is a bidirectional field-mapper; "download a file → create
  evidence" doesn't fit it. SP-4's policy content sync will use the orchestrator
  shape.
- **Manual import is synchronous + capped at 20.** Avoids the async job/poll
  machinery for the common small selection; larger batches are rejected with a
  clear message (a future enhancement can enqueue). Delta sync (unbounded) is
  always async via the job.
- **Delta "changed" re-imports as a fresh evidence row** and re-points the
  mapping — there's no in-place "replace evidence file" usecase, and a new row
  preserves the prior version's audit trail.
- **Evidence-detail "View in SharePoint" chip + per-row "Sync now" deferred to
  the SP audit round** — UI polish; the backing data (`sourceUrl`, the mapping,
  delta sync) is all in place here.

## Files

| File | Role |
| --- | --- |
| `providers/sharepoint/import.ts` | Manual import + delta sync. |
| `jobs/sharepoint-delta-sync.ts` + `executor-registry.ts` + `schedules.ts` + `types.ts` | The BullMQ job, dispatcher, schedule, payloads. |
| `api/t/[slug]/integrations/sharepoint/{import,sync,connections}/route.ts` | Practitioner routes. |
| `prisma/schema/automation.prisma` + migration | `sourceUrl` column. |
| `evidence/UploadEvidenceModal.tsx` | "Import from SharePoint" wiring. |
| `tests/unit/sharepoint-import.test.ts` + `tests/guards/sharepoint-sp3.test.ts` | Coverage + ratchet. |

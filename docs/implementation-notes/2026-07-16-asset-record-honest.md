# 2026-07-16 — Make the asset record honest end to end

**Commit:** `<pending> feat(assets): honest owner model, CSV import, surfaced fields + criticality backfill`

## Design

The asset record had a split owner model, a dead import column, and several
half-wired fields (displayed but unsettable, or mapped but unsurfaced). This
reconciles all of them so what the UI shows equals what the API accepts equals
what is persisted.

### Owner — one concept: `ownerUserId`

`owner` (free-text) and `ownerUserId` (member FK) were both live: search + list
column + quick-look read the free-text; the create form set only the assignee;
the detail page showed BOTH as "Owner" and "Assigned to".

Now the single owner concept is the resolved assignee:

- `AssetRepository` list/detail `include: { ownerUser: { name, email } }`; the
  list column, quick-look, and detail page render it via `ownerDisplayName`.
- Search `q` matches `ownerUser.name/email` (a relation filter) in addition to
  the legacy free-text `owner`.
- The legacy free-text `owner` is demoted to a labeled *imported* fallback,
  shown ONLY when there is no assignee — never a competing second field. It is
  no longer editable in the forms (import-only).
- CSV import resolves a free-text owner cell to `ownerUserId` against the
  tenant roster (by name or email); free-text is kept only on no-match.

### CSV import — honest columns, dedupe, one request

- The `Criticality` CSV column was validated then silently discarded (the
  server always derives criticality from CIA). **Dropped** from the template +
  validation. The preview keeps a CIA-*derived* criticality column (honest).
- New `POST /assets/bulk/import` (`bulkImportAssets`) replaces N sequential
  client POSTs with one request. It dedupes by name (case-insensitive, in-batch
  + against existing assets) and reports `{ created, skipped, errors[] }`.
- A row missing `type` is now a client-side parse error (so the bulk request is
  always schema-valid), rather than an opaque per-POST 400.

### Dead / unsurfaced fields

- `externalRef` was rendered read-only but absent from BOTH asset schemas — it
  could never be written. Added to `Create`/`UpdateAssetSchema` + the usecase
  mapping + create/edit forms.
- `dependencies` / `businessProcesses` / `retention` were schema+usecase-mapped
  but in no UI. Surfaced in the create/edit forms and the detail Overview.
- The dead `criticality` field (no control, stripped, server-derived) was
  removed from the edit form.

### Criticality backfill + edit-modal staleness

- Migration `20260716120000_backfill_asset_criticality` sets the stored enum for
  legacy `NULL` rows using the exact CIA banding, so the KPI/filter (stored
  enum) agree with the badge (CIA-derived) for every row.
- `<EditAssetModal>` is keyed on `asset id + an open counter` so it re-seeds on
  every open — a reopened form never shows stale values. Keyed on OPEN only, so
  the close animation is preserved.

## Files

| File | Role |
| --- | --- |
| `prisma/migrations/20260716120000_backfill_asset_criticality/migration.sql` | Backfill stored criticality for NULL rows (CIA banding in SQL). |
| `src/lib/schemas/index.ts` | `externalRef` on Create/Update; new `BulkImportAssetsSchema`. |
| `src/app-layer/usecases/asset.ts` | `externalRef` mapping; `bulkImportAssets` (dedupe + owner resolution). |
| `src/app-layer/repositories/AssetRepository.ts` | `ownerUser` include on list/detail; `q` matches assignee name/email. |
| `src/app/api/t/[tenantSlug]/assets/bulk/import/route.ts` | New bulk-import endpoint. |
| `src/app/t/[tenantSlug]/(app)/assets/import/page.tsx` | Drop Criticality column; one bulk POST; skipped reporting. |
| `src/app/t/[tenantSlug]/(app)/assets/AssetsClient.tsx` · `AssetDetailPanel.tsx` · `[id]/page.tsx` | Resolve + render one Owner; surface context fields; modal re-seed. |
| `src/app/t/[tenantSlug]/(app)/assets/_form/*` · `src/lib/schemas/asset-form.ts` | Add externalRef + context inputs; drop dead criticality field. |

## Decisions

- **Free-text `owner` kept as a labeled import fallback**, not deleted — legacy
  rows and CSV imports without a matching member still show *something*, clearly
  marked distinct from a real assignee. The alternative (drop the column) would
  lose that provenance.
- **Backfill in SQL, not a script** — a migration runs in the deploy pipeline
  automatically and covers every tenant; the banding replicates
  `getAssetCriticality` exactly (`round(numeric)` matches `Math.round` on the
  1..5 domain). Derive-on-write keeps it true afterward, so it runs once.
- **Dedupe needs the full tenant name set** — `bulkImportAssets` reads all asset
  names once (`select: name` only, `guardrail-allow: unbounded`) for correct
  case-insensitive dedupe; owner resolution reads the roster once. Everything
  else is in-memory; per-row create errors are isolated.
- **Column-mapping UI deferred** — the prompt said "consider"; fixed headers +
  robust validation cover the need. A mapping step is a clean follow-up.

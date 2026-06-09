# 2026-06-09 — Evidence-binary bundling in audit-pack export (SP-F2)

**Commit:** `<sha>` feat(integrations): bundle evidence binaries in SharePoint export (SP-F2)

Closes the SP-5 deferral: the export ZIP now carries the actual evidence files,
not just the manifest.

## What

`exportAuditPackToSharePoint` now adds the pack's evidence FILE binaries under
`evidence/` in the ZIP (alongside `README.md` / `pack.json` / `items.csv`):

- Resolves FileRecords from the pack's `EVIDENCE` items (via `Evidence.fileRecord`)
  and `FILE` items (directly), in one batched query per type.
- Reads bytes via `StorageProvider.readStream(pathKey)` (works for both the
  local and S3 providers).
- **Only bundles scanned-clean, `STORED`, non-deleted files** (`isDownloadAllowed`
  + status/deletedAt checks) — never ships an unscanned or infected file to an
  auditor.
- Caps total bundled payload at `SP_EXPORT_MAX_BYTES` (200 MB); de-dupes names
  within the ZIP; a read failure skips that file (logged) without failing the export.
- The `IntegrationExecution.resultJson` records `evidenceBundled` / `evidenceSkipped`.

## Decisions

- **AV-gated, not best-effort** — exporting an infected/unscanned file to a
  customer's SharePoint would be a real incident, so the scan gate is mandatory.
- **In-memory ZIP with a hard byte cap** — packs are bounded; streaming a ZIP to
  SharePoint would need chunked upload sessions (a larger change). The 200 MB cap
  + skip-and-log keeps memory bounded; very large packs degrade gracefully.

## Files

| File | Change |
| --- | --- |
| `usecases/audit-pack-sharepoint-export.ts` | `bundleEvidenceBinaries` + wiring + cap. |

# 2026-07-16 — Scanner-finding → asset linkage + asset soft-delete lifecycle UI

**Commit:** `<pending> feat(assets): link scanner findings to assets + wire soft-delete lifecycle UI`

## Design

Two structural gaps closed: scanner findings never reached an asset, and the
asset soft-delete lifecycle had backend + routes but no recovery UI.

### 1 · Scanner findings → assets

`ScannerFinding` had no asset association — scanner findings reached controls
(via materialised Findings) and the global findings register, but never an
asset, so the asset vuln tab could never show them.

- **Schema:** `ScannerFinding.assetId String?` + `@@index([tenantId, assetId])`
  + `asset Asset? @relation(onDelete: SetNull)`. Nullable so unresolved targets
  stay unlinked; SetNull so a finding survives its asset's purge.
- **Resolution rule (explicit):** a scan run targets one repo, so the asset is
  resolved **once per run** from `ScannerRun.repoRef`: strip any `@<ref>` suffix,
  then match case-insensitively against `Asset.externalRef`, then `Asset.name`.
  First match wins. **No match → findings left unlinked, and an info log is
  emitted (never guessed).** A later run that can't resolve does NOT null an
  existing link.
- **Surface:** `listAssetScannerFindings(ctx, assetId)` + `GET
  /assets/[id]/scanner-findings`; the asset detail vuln tab renders a second
  card (severity / finding / rule / location / scanner / status) alongside the
  CVE-matched `AssetVulnerability` table — the asset now shows its full picture.

### 2 · Asset soft-delete lifecycle UI

Backend (`deleteAsset` / `restoreAsset` / `purgeAsset` /
`listAssetsWithDeleted`) + routes + `GET ?includeDeleted=true` all existed but
nothing consumed restore / purge / includeDeleted.

- **Deleted-assets view:** a `permissions.canAdmin`-gated "Deleted assets"
  toggle in the assets-list toolbar threads `includeDeleted=true` into the SWR
  key; deleted rows get a **Restore** action and a **Purge** action.
- **Purge = typed-confirmation modal** (irreversible) — mirrors the
  `TenantsTable` pattern: the confirm button unlocks only when the operator
  types the asset's `key`/`name`. Restore is a direct action.
- `listAssetsWithDeleted` now returns the **same enriched row shape** as
  `listAssets` (shared `enrichAssetRows` helper — task + open-vuln rollups +
  ownerUser) so the deleted view renders with the identical columns.
- **Single-asset delete on the detail page:** a `canAdmin`-gated trash action
  → `ConfirmDialog` → soft-delete → back to the list. (Soft-delete is
  reversible via the deleted view, so a plain confirm is right here; the
  irreversible purge is the one behind the typed modal.)

## Files

| File | Role |
| --- | --- |
| `prisma/schema/assets.prisma` + migration `20260716140000_scanner_finding_asset_link` | `ScannerFinding.assetId` FK + index. |
| `src/app-layer/usecases/scanner-ingestion.ts` | Resolve asset from repoRef; set `assetId`; `listAssetScannerFindings`. |
| `src/app/api/t/[tenantSlug]/assets/[id]/scanner-findings/route.ts` | New GET. |
| `src/app-layer/usecases/asset.ts` | `enrichAssetRows` helper; enriched `listAssetsWithDeleted`. |
| `src/app/.../assets/[id]/page.tsx` | Scanner-findings card on the vuln tab; single-delete affordance. |
| `src/app/.../assets/AssetsClient.tsx` + `page.tsx` | Deleted-assets toggle + Restore + typed-confirm Purge; pass `canAdmin`. |

## Decisions

- **assetId FK on ScannerFinding (not only a FindingAsset link)** — scanner
  findings exist below the materialisation threshold too; linking the finding
  row directly surfaces ALL of an asset's findings on its vuln tab, not just the
  ones that became Findings.
- **Resolve per-run from repoRef** — a run targets a single repo, so one lookup
  covers all its findings. Matching `externalRef` then `name` is the explicit,
  auditable rule; unresolved is logged so the gap is visible, never guessed.
- **Purge is typed-confirm, delete is plain confirm** — soft-delete is
  reversible (restore), so the 5-second-undo/plain-confirm register fits; the
  irreversible hard purge earns the type-to-confirm gate per the Epic-67
  top-level-entity exception.

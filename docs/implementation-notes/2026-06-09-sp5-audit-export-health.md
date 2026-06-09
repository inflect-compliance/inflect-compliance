# 2026-06-09 — Audit-pack SharePoint export + sync-health dashboard (SP-5)

**Commit:** `<sha>` feat(integrations): audit-pack SharePoint export + sync-health dashboard (SP-5)

## Why

The final SharePoint epic: push frozen audit packs to a SharePoint library (so
auditors access them in their native environment) and give admins a per-tenant
view of SharePoint sync health.

## Design

- **`audit-pack-sharepoint-export.ts`** — `exportAuditPackToSharePoint`: verify
  the pack is `FROZEN`, build a ZIP (`README.md` + `pack.json` manifest +
  `items.csv`, reusing `exportAuditPack`), upload it to the chosen drive via the
  new `client.uploadNewFile` (root path syntax), and record `spExport{ItemId,
  WebUrl,At}` on the AuditPack + an `IntegrationExecution`
  (`automationKey: sharepoint.audit_pack_export`) for the dashboard.
- **`health.ts`** — `getSharePointHealth`: connection test status, the last 100
  `IntegrationExecution`s, evidence-mapping coverage (synced/stale/failed/total),
  and the policy-link count.
- **UI** — `SharePointExportButton` on a FROZEN pack's detail page (admin-gated;
  connection + drive picker → upload → result link); a sync-health dashboard at
  `admin/integrations/sharepoint-health`, linked from the SharePoint card.
- **Routes** (`admin.manage`) — `audits/packs/:id/sharepoint-export` (POST) +
  `integrations/sharepoint/health` (GET).
- **Schema** — `AuditPack.{spExportItemId,spExportWebUrl,spExportedAt}`.

## Decisions

- **Manifest ZIP, not raw evidence binaries.** The export bundles the pack
  manifest (json + csv) — reusing the existing `exportAuditPack` — not the
  evidence FileRecord binaries. Bundling the binaries (fetch from storage per
  item) is a documented follow-up; the manifest already gives auditors the pack
  structure + snapshots in SharePoint.
- **Export to the drive root by default.** The export modal selects a connection
  + drive; `folderId` defaults to `'root'`. Sub-folder targeting (reusing the
  picker in a folder-select mode) is a follow-up.
- **`uploadNewFile` vs `uploadItemContent`** — SP-4's `uploadItemContent`
  replaces an existing item; SP-5 needs to CREATE a new file under a folder
  (`/items/{folder}:/{name}:/content`), hence the separate client method.

## Files

| File | Role |
| --- | --- |
| `usecases/audit-pack-sharepoint-export.ts` | FROZEN-gated ZIP export. |
| `providers/sharepoint/{client,health}.ts` | `uploadNewFile` + health aggregation. |
| `api/t/[slug]/audits/packs/[packId]/sharepoint-export/route.ts` | Export route. |
| `api/t/[slug]/integrations/sharepoint/health/route.ts` | Health data route. |
| `audits/packs/[packId]/SharePointExportButton.tsx` | Export UI. |
| `admin/integrations/sharepoint-health/page.tsx` | Dashboard. |
| `prisma/schema/audit.prisma` + migration | AuditPack `spExport*` columns. |

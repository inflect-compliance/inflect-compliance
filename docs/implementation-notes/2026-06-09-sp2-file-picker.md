# 2026-06-09 — SharePoint site/library browser (SP-2)

**Commit:** `<sha>` feat(integrations): SharePoint file-picker + browse routes (SP-2)

## Why

SP-1 connected SharePoint; SP-2 lets practitioners browse the hierarchy
(Site → Library → folder → file) and pick documents. The picker is the reusable
seam both SP-3 (evidence import) and SP-4 (policy link) consume.

## Design

- **Routes (practitioner-facing, `evidence.upload`-gated)** under
  `/api/t/[slug]/integrations/sharepoint/`:
  - `sites` → resolves the connection's allowed sites + their drives in one
    response (the picker's two selectors).
  - `browse?driveId&itemId&pageToken` → one lazy page of a folder, flattening
    Graph DriveItems into `SpBrowseItem` (folder vs file, `hasChildren`,
    `mimeType`); passes the Graph `@odata.nextLink` through as `nextPageToken`.
  - Both build an authed client via `getSharePointClient` (refresh-on-expiry);
    no admin gate — sourcing evidence is an editor action.
- **`SharePointFilePicker`** (`components/integrations/sharepoint/`) — a `Modal`
  browser: site + drive `Combobox`es, **breadcrumb drill-in** folder navigation
  (click a folder to enter, a crumb to go up), a file list with `Checkbox`
  multi-select (or single), a client-side file-type filter (All / Documents /
  Spreadsheets / PDFs), and a selection bar that `onConfirm`s the picks.

## Decisions

- **Breadcrumb drill-in over a persistent lazy `TreeView`.** Functionally
  equivalent for a modal picker and far simpler/robuster than managing a merged
  lazy-tree node set; the breadcrumb is the roadmap's up-navigation anyway.
- **Picker is library code in SP-2 — consumers wire it up later.** The
  "Import from SharePoint" mount in the evidence modal lands in **SP-3** (where
  the import endpoint exists), and the policy "Link" mount in **SP-4** (where
  the policy SP columns land). Shipping the picker + routes first keeps each PR
  coherent and independently testable.
- **Rendered test deferred.** The picker's data path is covered by the browse
  service unit test; a DOM test currently crashes in `@radix-ui/react-presence`
  under jsdom (a Dialog-portal/React-19 interaction, not a component bug). The
  audit round will add a rendered test with a proper Radix harness. SP-2 is
  guarded structurally (`tests/guards/sharepoint-sp2.test.ts`).

## Files

| File | Role |
| --- | --- |
| `providers/sharepoint/service.ts` | `browseSharePoint` + `getSharePointSitesAndDrives` (+ `SpBrowseItem`). |
| `providers/sharepoint/client.ts` | `allowedSiteIds` getter for the service. |
| `api/t/[slug]/integrations/sharepoint/{browse,sites}/route.ts` | Practitioner browse routes. |
| `components/integrations/sharepoint/SharePointFilePicker.tsx` | The picker modal. |
| `tests/unit/sharepoint-browse.test.ts` | Service flattening + sites/drives. |
| `tests/guards/sharepoint-sp2.test.ts` | Structural ratchet. |

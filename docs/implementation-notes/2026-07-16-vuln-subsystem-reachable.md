# 2026-07-16 — Make the vulnerability subsystem reachable and operable

**Commit:** `<pending> feat(vulnerabilities): surface the built subsystem via in-page links + triage`

## Design

The vulnerability subsystem was real but under-surfaced: the global
`/vulnerabilities` page was orphaned (reachable only by URL), scanner runs and
scanner-finding triage were hidden, and there was no cross-asset vuln signal.
This wave makes what's built reachable and operable **without any new
navbar/sidebar entries** — discoverability comes entirely from inbound in-page
links.

### Discoverability (no `SidebarNav` change)
- Assets list toolbar: a `bug`-icon link → `/vulnerabilities`.
- Assets list: a per-asset **open-vuln column** (count tinted by top severity)
  deep-linking to `/vulnerabilities?assetId=<id>`.
- Asset detail vuln tab: "See all vulnerabilities →" → the same deep-link.
- Security-testing page: "View all vulnerabilities →".
- Risks page: the retired shield affordance restored as an in-page link; the
  **false comment** claiming `/vulnerabilities` was a "first-class Security
  sidebar destination" is deleted and replaced with an accurate note.
- `vulnerabilities/page.tsx` now reads `?assetId=` (SSR filter) so the deep-links
  land on a scoped view.

### Operability
- **ScannerRun history** — `SecurityTestingClient` rendered only `runs.length`;
  now a runs table (outcome / source+scan / repo / ran / via / findingCount).
- **Scanner-finding triage** — new `updateScannerFindingStatus` usecase + PATCH
  `security-testing/findings/[id]` + a write-gated status Combobox (OPEN /
  TRIAGED / FIXED / FALSE_POSITIVE / ACCEPTED). Re-ingestion preserves the
  analyst status (the existing upsert keeps it).
- **Manual CVE link** — a "Link CVE" modal (asset picker + CVE id + note) calls
  the existing `POST /vulnerabilities` (`linkCveToAsset`), so a tenant without
  CPE identity can record vulnerabilities in-product.
- **Analyst note** — the encrypted `AssetVulnerability.note` gets a Note column
  + inline editor on the global page (PATCH already supported it).
- **Per-asset vuln rollup** — `listAssets` folds in a batched OPEN-vuln count +
  top severity (one `groupBy` + one `distinct` findMany over the ≤100 listed
  ids) to back the list column.

### Honesty cleanup
- `ingestedVia = 'WEBHOOK'` was an accepted enum value with no producer.
  Removed from the Zod enum (`['API','UPLOAD']`) and the Prisma doc comment —
  don't advertise a provenance the product can't produce.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/scanner-ingestion.ts` | `updateScannerFindingStatus` + `SCANNER_FINDING_STATUSES`; drop WEBHOOK from `ingestedVia`. |
| `src/app/api/t/[tenantSlug]/security-testing/findings/[id]/route.ts` | New PATCH — triage a scanner finding. |
| `src/app-layer/usecases/asset.ts` | `listAssets` batched per-asset OPEN-vuln rollup. |
| `src/app/.../security-testing/SecurityTestingClient.tsx` | Runs table + write-gated triage combobox + vulns link. |
| `src/app/.../vulnerabilities/VulnerabilitiesClient.tsx` | Link-CVE modal + note column/editor. |
| `src/app/.../vulnerabilities/page.tsx` | Read `?assetId=` (SSR filter). |
| `src/app/.../assets/AssetsClient.tsx` | Vuln column + toolbar link. |
| `src/app/.../assets/[id]/page.tsx` | "See all vulnerabilities →" on the vuln tab. |
| `src/app/.../risks/RisksClient.tsx` | Restore in-page shield link; delete false sidebar comment. |
| `prisma/schema/assets.prisma` | `ingestedVia` doc: drop WEBHOOK. |

## Decisions

- **In-page links, never a nav entry** — the subsystem is deliberately reached
  from the surfaces it relates to (assets, asset detail, security-testing,
  risks). This keeps the primary nav lean while making every path discoverable.
- **WEBHOOK removed, not implemented** — a webhook ingest route is a real
  feature with auth/verification design; rather than ship an aspirational enum
  value, remove it until that route exists. The Prisma column stays `String`, so
  re-adding later needs no migration.
- **Per-asset rollup is batched** — a `groupBy` for the count + a
  `distinct`-on-assetId findMany (ordered by CVSS score) for the top severity,
  both bounded by the ≤100 listed ids. No per-row query; `computeAssetRollups`
  stays the single-asset path for the detail page.
- **No new `.openapi` schema for the PATCH** — the triage route uses an inline
  Zod body; the route path is captured by the OpenAPI path inventory.

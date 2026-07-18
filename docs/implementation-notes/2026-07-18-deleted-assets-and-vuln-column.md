# 2026-07-18 — Deleted-assets view + vuln-column correctness (PR-W)

**Commit:** `<sha> fix(assets): scope the Deleted view, fold scanner findings into the vuln column, fix nulls-first severity, inline triage`

## Design

The soft-delete "Deleted assets" view and the new per-asset vuln column
shipped with real bugs. This PR fixes seven, spanning the repository,
usecases, scanner ingestion, the two lifecycle routes, and the two client
surfaces.

### Deleted view (1, 2)
`listAssetsWithDeleted` opted out of the soft-delete read-filter via
`withDeleted` but never added `deletedAt: { not: null }`, so it returned
**every** asset. The query moved into `AssetRepository.listDeleted`, which
reuses the live-list `_buildWhere` (so type/status/criticality/q filters
work identically) and adds the deleted-only predicate. The route now
threads the toolbar filters through. Client: the KPI band (Total/Active/…,
which describe the LIVE set and whose click-to-filter sets status filters)
is hidden in deleted mode, and a distinct "No deleted assets" empty state
replaces the "Add asset" CTA.

### Vuln column + severity (3, 4)
`enrichAssetRows` and `computeAssetRollups` counted only CVE
`AssetVulnerability` rows, so a scanner-only asset showed "—"/0 in the list
while its detail tab listed CRITICAL findings. Both now fold OPEN
`ScannerFinding` rows (by `assetId`) into the count AND the max-severity,
batched (groupBy for counts, a distinct-per-asset severity pull for the
fold — no N+1). The max-severity ordering gained `nulls: 'last'` so a
null-scored CVE no longer sorts ahead of a real CRITICAL (Postgres DESC =
NULLS FIRST) and greys the badge. A shared `worseSeverity` reducer ranks
CVSS/scanner labels and folds the two sources.

### Detail tab triage (5)
The asset detail Vulnerabilities tab is now triageable inline — CVE
status/owner/due/note via `PATCH /vulnerabilities/[id]`, scanner status via
`PATCH /security-testing/findings/[id]` — reusing the global pages'
optimistic-override pattern. The scanner status badge is tinted (was
hardcoded `variant="neutral"`), and both feeds default to OPEN with a
"Show resolved" toggle, matching the "open vulnerabilities" framing of the
list column.

### Scanner→asset resolution (6)
`ingestScannerRun` resolved the scan target with a single `findFirst`
matching `externalRef` OR `name` with no `orderBy` — a name collision could
mislink or flip between runs. Now: externalRef is tried first (strictly
preferred over the softer name key), each lookup carries a stable
`[createdAt, id]` tiebreak, so resolution is deterministic.

### Authz + activity (7)
`restore` / `purge` routes used bare `getTenantCtx`; they now use
`requirePermission('assets.edit')` (matching the DELETE handler) so denials
audit via the Epic C.1 guard. `ENTITY_RESTORED` was added to the asset
activity label map so a restore renders a friendly label, not a raw enum.

## Files

| File | Role |
| --- | --- |
| `repositories/AssetRepository.ts` | New `listDeleted` — deleted-only + filters |
| `usecases/asset.ts` | Fold scanner into count/severity + nulls-last; `worseSeverity`; `listAssetsWithDeleted` delegates |
| `usecases/scanner-ingestion.ts` | Deterministic externalRef-preferred resolution + stable tiebreak |
| `api/.../assets/route.ts` | Thread filters into the deleted view |
| `api/.../assets/[id]/restore|purge/route.ts` | `requirePermission('assets.edit')` |
| `(app)/assets/AssetsClient.tsx` | Hide KPI band + "no deleted assets" empty state in deleted mode |
| `(app)/assets/[id]/page.tsx` | Inline CVE + scanner triage, tinted scanner status, OPEN-default + toggle, `ENTITY_RESTORED` label |
| `messages/{en,bg}.json` | `ENTITY_RESTORED` + deleted/triage keys |

## Decisions

- **`nulls: 'last'` over coalesce.** Prisma 7 supports nested-relation nulls
  ordering; it keeps the top-CVE-per-asset query a single distinct pull.
  Highest CVSS score ⇒ highest severity (score bands), so the top-scored
  CVE's severity is the worst CVE severity; the scanner fold then covers the
  scoreless source.
- **Fold in memory, stay batched.** Counts come from `groupBy`; the fold
  pulls distinct severity labels per asset (≤4 scanner + ≤1 CVE-top), ranked
  by `worseSeverity` — bounded, no per-row reads.
- **Hide the KPI band in deleted mode** rather than recompute it — the
  cards + their click-to-filter describe the live set; surfacing them over
  soft-deleted rows would mislead.
- **`assets.edit` for restore/purge.** The permission set has no
  delete/admin asset key and the soft-delete DELETE already uses
  `assets.edit`; matching it keeps the gate consistent (the deleted view +
  usecases retain their `assertCanAdmin` backstop).

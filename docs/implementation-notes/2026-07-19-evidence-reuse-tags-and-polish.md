# 2026-07-19 — Evidence: reuse across risks/assets, tags, freshness parity

**Commit:** `<pending> feat(evidence): risk/asset reuse joins, tags, gallery freshness parity, KPI scope`

## Design

### 1. Reuse without cloning, extended to risks and assets

`Evidence↔Control` became many-to-many (`EvidenceControlLink`) precisely
because re-uploading the same artifact to N controls cloned N Evidence
rows. That same migration left `Evidence.riskId` / `Evidence.assetId` as
**singular FKs** — so the identical cloning problem persisted for risks
and assets: one SOC 2 report could not be attached to two risks without
uploading it twice.

`EvidenceRiskLink` / `EvidenceAssetLink` mirror the control join exactly,
including the load-bearing composite FK
`(evidenceId, tenantId) → Evidence(id, tenantId)` that makes a
cross-tenant link impossible **at the DB level**, not merely under RLS.
Each gets the canonical RLS trio (`tenant_isolation`,
`tenant_isolation_insert`, `superuser_bypass`) + `FORCE ROW LEVEL
SECURITY`, and both directional indexes.

**Expand/contract, not a rip-and-replace.** The migration backfills every
existing attachment into the join and then *leaves the singular columns
in place*:

- **reads** (risk/asset evidence tabs) go through the join;
- **writes** create the join row, and still stamp the singular FK — which
  becomes the "uploaded from" **provenance** the detail sheet already
  renders, a genuinely different question from "what is this attached
  to";
- **detach** drops the join row and clears the stamp only when it pointed
  at the risk/asset being detached.

Rollback is redeploying the prior image, which still reads the singular
columns — they are dropped in a later PR once nothing reads them.

The upload path matters here: an upload started *from* a risk now creates
the join row too. Without that, a file uploaded from a risk would not
appear on the very risk it was uploaded from.

The detail sheet's footprint accordingly reports **controls · risks ·
assets** instead of a single source.

### 2. The gallery freshness badge was always empty

`EvidenceGallery` read `row.lastRefreshedAt` — a field `EvidenceRow`
never had — and passed no `now`. So every gallery card rendered the "no
refresh recorded" state while the *same rows* in the table showed real
freshness: toggling table→gallery silently changed the meaning of
identical data, and the badge was non-deterministic under SSR.

It now takes the same `reviewCurrencyAnchor` value (`nextReviewDate ??
expiredAt`) and the same `useHydratedNow()` clock the table cell uses.
The doc comment claiming `updatedAt`-driven freshness was wrong twice
over and is replaced with what the field actually is.

### 3. Tags

`folder` + `category` were the only organisation primitives, both flat
nullable strings. `EvidenceTag` is a join model rather than a
`String[]`/`Json` column: the repo has been migrating *away* from
denormalised refs (the control join), and `folder` already needed its own
index to be filterable at all. A row per (evidence, tag) keeps the filter
an indexed lookup.

Tags normalise to trimmed + lower-case, so `SOC2` / `soc2` / ` soc2 ` are
one tag — a case-sensitive tag filter would be useless as an organisation
dimension. The filter is **server-side** (`?tag=`), so the result set
matches what the chip claims.

### 4. KPI tiles vs the filtered list

The freshness tiles read a tenant-wide server aggregate, but clicking one
refines **client-side** over the loaded page (the API's schema `.strip()`s
`freshness`). Past the 5,000-row fetch cap those two numbers legitimately
differ, and the page showed the tenant-wide count beside a shorter list
with no explanation — which reads as a bug.

Taking the roadmap's second option: the mismatch is now **labelled**
("showing N of M matching tenant-wide") rather than pushed server-side.
Pushing the freshness predicate into SQL means expressing
`evidenceFreshnessBucket`'s four-way derivation as a query — a bigger,
riskier change than this PR should carry alongside a schema migration.

### 5. The stale bulk-approve comment

Only **one** of the two flagged comments was stale. `:285-287` claimed
bulk-approve bypasses the review chain — false: `bulkApproveEvidence`
asserts admin, filters to SUBMITTED, and partitions on segregation of
duties. The comment twelve lines below already said so correctly and is
**kept**. Deleting both would have removed an accurate explanation.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/evidence.prisma` | `EvidenceRiskLink`, `EvidenceAssetLink`, `EvidenceTag` |
| `prisma/migrations/20260719160000_…/` | tables + indexes + backfill + RLS trio |
| `src/app-layer/usecases/risk.ts` · `asset.ts` | read/attach/detach through the join |
| `src/app-layer/usecases/evidence.ts` | upload creates join rows; tag reconcile |
| `src/app-layer/repositories/EvidenceRepository.ts` | footprint in `getById`, `setTags`, tag filter |
| `src/components/ui/EvidenceGallery.tsx` | real freshness anchor + shared clock |
| `.../evidence/EvidenceClient.tsx` | gallery clock, KPI scope notice, corrected comment |
| `.../evidence/EvidenceDetailSheet.tsx` | footprint + tag chips |
| `tests/integration/evidence-risk-asset-link-rls.test.ts` | **new** — 11 two-tenant RLS/composite-FK cases |

## Decisions

- **Expand/contract over a hard cutover.** Dropping `riskId`/`assetId` in
  the same migration would make rollback lossy. Keeping them as
  provenance is not debt-by-accident — "uploaded from" is a real,
  distinct fact the sheet already surfaces.
- **A join model for tags, not a string array.** Matches the schema's
  direction of travel and keeps the filter indexed.
- **Normalise tags on write.** The unique key is on the normalised value;
  a case-sensitive tag dimension fragments immediately.
- **Label the KPI mismatch rather than move the filter server-side.** The
  roadmap allowed either. The server-side option needs the four-way
  freshness derivation expressed in SQL — worth its own PR, not a rider
  on a schema migration.
- **Kept the accurate bulk-approve comment.** The roadmap asked for both
  to go; only one was false.

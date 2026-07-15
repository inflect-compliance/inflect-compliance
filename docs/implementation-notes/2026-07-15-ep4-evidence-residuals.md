# 2026-07-15 — EP-4 evidence residuals (server KPI aggregate + swallowed-failure sweep)

**Commit:** `<pending>` feat(evidence): server-side retention/KPI aggregate + surface swallowed failures

The final PR of the evidence-library roadmap. Closes the residuals left after
EP-1..EP-3: the list KPI tiles were computed over the ≤100-row SSR page (wrong
on large tenants), and several evidence surfaces swallowed failures.

## Design

### Part 1 — server-side retention/KPI aggregate (the core)

The Evidence list rendered two KPI strips (status: total/draft/submitted/
approved; freshness: current/expiring/expired/needs-review) plus an "all
current" celebration by counting the ≤100 loaded rows client-side. Past the
SSR cap those numbers silently under-reported.

`getEvidenceRetentionMetrics(ctx)` (usecase, READER-gated) →
`EvidenceRepository.retentionMetrics` computes the authoritative counts by DB
aggregate over the FULL dataset — a fixed **5 queries** (one
`groupBy(status)` + four `count`s), never a per-row loop:

```
{ total, byStatus: {DRAFT,SUBMITTED,APPROVED,REJECTED,NEEDS_REVIEW},
  active, archived, expiringSoon, expired, needsReview, current }
```

Bucket semantics mirror `evidenceFreshnessBucket` exactly (over non-deleted
rows, archived included), so the server tiles agree with the per-row freshness
badge the table renders:
- `needsReview` = status NEEDS_REVIEW (wins the bucket outright).
- `expired` = expiredAt set, OR (no expiredAt) nextReviewDate lapsed, OR (no
  review date) retentionUntil lapsed.
- `expiringSoon` = not expired, review/retention date within 30 days.
- `current` = arithmetic remainder (`total − needsReview − expired −
  expiringSoon`) — every non-deleted row lands in exactly one bucket.
- `active` = not archived, not expired, not deleted; `archived` = isArchived.

Wiring mirrors the Tasks TP-7 pattern: SSR `page.tsx` fetches the aggregate in
its `Promise.all` and passes `initialMetrics`; the client seeds
`useTenantSWR(CACHE_KEYS.evidence.retention(), { fallbackData: initialMetrics })`
and binds every KPI tile + the "all current" celebration to `metrics.*`. The
table still reads the existing paged list — only the aggregate tiles changed
source.

**Index + migration.** `@@index([tenantId, status, expiredAt])` +
`20260715120000_evidence_retention_metrics_index/migration.sql` (hand-written
`CREATE INDEX`) back the groupBy + expiry bucket scans.

**Endpoint.** `GET /api/t/[tenantSlug]/evidence/retention` (reader-gated). The
task named `/evidence/metrics`, but that path is already taken by the ADMIN-only
`getEvidenceMetrics` (storage / top-controls). The pre-existing but unused
`CACHE_KEYS.evidence.retention()` key mapped exactly here, so the new aggregate
lives at `/evidence/retention` — no collision, semantically named.

### Part 2 — control-link failure (verify + lock)

EP-3 already made evidence↔control link creation transactional:
`createControlLinks` runs INSIDE the same `runInTenantContext` tx as the
evidence write, so a failed link write rolls the whole thing back — no
linked-looking success, no CREATE audit. Added a behavioural mock test proving
the throw propagates, the audit never fires, and evidence + links share one tx
handle.

### Part 3 — SharePoint probe states

`UploadEvidenceModal` swallowed ALL probe errors, so a fetch throw / non-ok
status was indistinguishable from "not connected" (button just never appeared).
Now a `spProbeError` flag distinguishes the two; a probe error renders an inline
`<InlineNotice variant="warning">`. No `console.*` (a guard bans it) — the state
IS the surfacing.

### Part 4 — swallowed-failure sweep

`EvidenceBulkImportModal` poll loop: `!res.ok` silently stopped and a network
throw retried forever. Now a `MAX_POLL_FAILURES`-bounded counter surfaces
`bulkImport.pollFailed` after 5 consecutive failures (reset on success).

### Part 5 — stale references

- `NewEvidenceTextModal`: removed the dead "React-Query cache invalidation"
  header + body comments (the modal refreshes via SWR only now).
- `EvidenceClient`: raw `alert(...)` on archive/unarchive failure → `toast.error`.

## Files

| File | Role |
| --- | --- |
| `src/lib/evidence-review-currency.ts` | New `EvidenceRetentionMetrics` type (shared server↔client contract) |
| `src/app-layer/repositories/EvidenceRepository.ts` | New `retentionMetrics` — the 5-query DB aggregate |
| `src/app-layer/usecases/evidence.ts` | New `getEvidenceRetentionMetrics` (reader-gated); expanded best-effort reason on the dedup `storage.delete` cleanup |
| `prisma/schema/evidence.prisma` | `@@index([tenantId, status, expiredAt])` |
| `prisma/migrations/20260715120000_evidence_retention_metrics_index/migration.sql` | `CREATE INDEX` for the aggregate |
| `src/app/api/t/[tenantSlug]/evidence/retention/route.ts` | New reader-gated GET returning the aggregate |
| `src/app/t/[tenantSlug]/(app)/evidence/page.tsx` | SSR fetch + `initialMetrics` prop |
| `src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx` | KPI tiles + celebration read server metrics; `alert` → `toast.error` |
| `src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx` | SharePoint probe error state + inline notice |
| `src/app/t/[tenantSlug]/(app)/evidence/EvidenceBulkImportModal.tsx` | Bounded poll-failure surfacing |
| `src/app/t/[tenantSlug]/(app)/evidence/NewEvidenceTextModal.tsx` | Retired stale React-Query comments |
| `messages/en.json`, `messages/bg.json` | 3 new keys each (spProbeError title/body, pollFailed) |
| `tests/integration/evidence-retention-metrics.test.ts` | 140-row full-dataset aggregate proof |
| `tests/unit/usecases/evidence-control-link-failure.test.ts` | Part 2 behavioural lock |
| `tests/unit/evidence-kpi-consistency.test.ts` | KPI-strip-reads-server-metrics structural lock |

## Decisions

- **Endpoint at `/evidence/retention`, not `/evidence/metrics`.** The latter is
  taken by the ADMIN-only storage-metrics usecase; reusing the unused
  `CACHE_KEYS.evidence.retention()` key avoided a collision and a needless
  rename of an existing route.
- **`current` derived, not queried.** Every non-deleted row lands in exactly
  one freshness bucket, so `current = total − needsReview − expired −
  expiringSoon` keeps the aggregate at 5 queries.
- **New `getEvidenceRetentionMetrics` kept separate** from the existing
  `getEvidenceMetrics` (admin storage/top-controls) and `getRetentionMetrics`
  (retention-dashboard buckets + top controls with expiring evidence). The three
  answer different questions; folding them would overload one usecase.
- **`isAllEvidenceCurrent` lib kept.** No longer called by the client (the
  celebration reads server metrics), but it remains an exported, unit-tested
  freshness helper that documents the milestone semantics; three milestone tests
  still exercise it.

### Intentionally-swallowed paths (with reasons)

- `evidence.ts` dedup `storage.delete(pathKey)` — best-effort orphan cleanup on
  a SHA-256 dedup hit. A failed delete leaks one orphan object (reclaimed by the
  retention/GC sweep) and must NOT fail the dedup path; there is no user-visible
  failure to surface. Comment expanded with this reason.
- `EvidenceBulkImportModal` `dropzoneRef.current?.startAll().catch(() => {})` —
  the per-file `onUpload` handler already surfaces the error via `setError` and
  re-throws; the outer catch only prevents an unhandled rejection.

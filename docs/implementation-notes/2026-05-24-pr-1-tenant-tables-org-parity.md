# 2026-05-24 — PR-1 tenant tables → org parity

**Commit:** `<sha> feat(pr-1): tenant tables → org-level load-more + sortable headers`

## Design

Two cross-cutting tenant-table fixes shipped together because they
share the same primitive surface and rollout footprint:

1. **Progressive disclosure ("Load more …").** Org-level tables
   already use `useCursorPagination` + a Load-more button for a
   server-cursor experience. Tenant tables render the full result
   set in one go — fine when row counts are small, painful when
   they cross a few hundred. This PR adds a sibling hook,
   `useThresholdLoadMore`, that slices an in-memory row array to a
   configurable threshold (default **50**) and exposes the same
   `hasMore` + `loadMore` vocabulary the cursor hook does. A shared
   `<TableLoadMoreFooter>` renders the action button + count line
   matching the org-table visual rhythm.

2. **Sortable headers with arrow indicators.** The tenant
   DataTable primitive (`src/components/ui/table/table.tsx`)
   already supports `sortableColumns`, `sortBy`, `sortOrder`, and
   `onSortChange` props — complete with up/down arrow icons baked
   in. No tenant page opted in; only the four org-level tables
   did. PR-1 wires the four props to the three highest-volume
   tenant list pages (Controls, Risks, Evidence) with client-side
   sort accessors.

The two slices ship together because every tenant rollout touches
the same `<EntityListPage>` / `ListPageShell.Body` surface — splitting
them would mean wrapping the same pages twice. The shared primitives
(hook, footer, `tableFooter` slot) are reusable beyond these three
pages — adding the same UX to Policies / Tasks / Vendors / Assets is
a one-page change each.

### Why client-side sort + slice (not cursor)

Tenant list pages already fetch the full row set on first paint via
`LIST_BACKFILL_CAP` (≈ 500 rows) and re-fetch on filter change. The
data is in memory; a server-cursor migration would mean:

  * adding `sortBy` / `sortOrder` query params to each API route +
    `listX` usecase
  * keeping the cursor stable across sort changes (or invalidating)
  * threading the cursor through the SWR cache key

That's a substantial migration with no user-visible benefit over
the in-memory equivalent — the rows are already there. Org tables
use a cursor because they sit on tenant-cross aggregation surfaces
that genuinely paginate server-side.

The two hooks expose the same return shape, so a future migration
of any specific tenant table to a server cursor is a drop-in swap
at the consumer level — replace `useThresholdLoadMore` with
`useCursorPagination`, keep the same `<TableLoadMoreFooter>` mount.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/hooks/use-threshold-load-more.ts` | New hook — sibling of `useCursorPagination` |
| `src/components/ui/hooks/index.ts` | Barrel re-export |
| `src/components/ui/table-load-more-footer.tsx` | New shared footer — renders the action button + count line; consumes either pagination shape |
| `src/components/layout/EntityListPage.tsx` | New `tableFooter` slot threaded into `ListPageShell.Body` after the DataTable |
| `src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx` | First rollout — threshold + sort accessor + footer |
| `src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx` | Second rollout |
| `src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx` | Third rollout |
| `src/components/ui/hooks/__tests__/use-threshold-load-more.test.tsx` | 8 behavioural assertions on the hook contract |
| `tests/guardrails/pr-1-tenant-tables-org-parity.test.ts` | 21 structural assertions: primitives + EntityListPage slot + per-page wiring |

## Decisions

* **Default threshold = 50.** Chosen as the row count past which
  scanning + interaction friction starts to compound on dense list
  pages. The hook accepts a per-call `threshold` override so
  individual pages can tune (e.g. a low-volume admin page could set
  it to 25; an info-dense controls page could raise to 100).

* **Increment defaults to the threshold.** Predictable rhythm —
  the second slice is the same size as the first. Override via
  `increment` if a page wants smaller batches.

* **Window stays put on input narrow.** When the user filters a
  120-row table down to 30 rows, the hook shows all 30 (because
  `slice(0, windowSize)` with `windowSize=50, rows.length=30`
  returns the full 30). `hasMore` evaluates to false. A future
  filter relax that grows the row count back past the window keeps
  the loaded window — no surprise re-collapse.

* **No `useEffect` reset on rows prop change.** Tested explicitly
  in the unit suite — adding such an effect would re-collapse the
  window every time the SWR cache refreshed, defeating the user's
  loaded position.

* **Sort accessor lives in the page, not the hook.** Each page
  knows which row fields its columns expose; encoding that as
  generic hook config would be over-abstraction. The accessor is
  typed against the page's row interface (or a local `Sortable`
  shape when the row is broadly `any`).

* **`<TableLoadMoreFooter>` consumes either pagination shape.**
  Cursor consumers pass `loading` + `error`; threshold consumers
  omit them. The component gates the error chip on `error` being
  truthy, so it stays hidden in the threshold flow. One footer
  primitive, two interaction models.

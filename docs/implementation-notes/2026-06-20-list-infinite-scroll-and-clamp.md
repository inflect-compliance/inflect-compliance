# 2026-06-20 — List-page load-on-scroll + viewport-clamp fix

**Commit:** `<sha> feat(lists): load-on-scroll + clamp assets/vendors to viewport`

Two related list-page changes:

1. **Viewport-clamp parity** — Assets and Vendors scrolled the whole
   page instead of clamping the table body to the viewport like
   Controls.
2. **Load-on-scroll** — the manual "Load more …" button
   (`<TableLoadMoreFooter>`) on the tenant list tables is replaced by
   infinite scroll: the next windowed batch appends automatically as
   the user nears the bottom. Applied to all seven tenant list pages
   (controls, risks, tasks, evidence, assets, vendors, policies).

## Design

### Clamp fix

The viewport-clamp is a flex chain: the app `<main>` → `ListPageShell`
(`md:flex-1 md:min-h-0`) → `ListPageShell.Body`
(`md:flex-1 md:min-h-0 md:overflow-hidden`) → `DataTable fillBody`
(`md:max-h-full md:min-h-0 md:overflow-y-auto` on the scroll wrapper).
Every ancestor must keep `flex-1 min-h-0` or the chain breaks and the
page scrolls instead of the table body.

`assets/page.tsx` and `vendors/page.tsx` wrapped their client in a
plain `<div className="space-y-section animate-fadeIn">` — a non-flex
block that severed the chain. Controls/Risks/Tasks/Policies/Evidence
render their client directly, so they already clamped. Fix: render the
client directly; `animate-fadeIn` moves onto the client's
`ListPageShell`. (Risks was reported alongside Assets but was already
structurally identical to Controls — the objective bug was assets +
vendors.)

### Load-on-scroll engine

```
useThresholdLoadMore(rows)        → { visibleRows, hasMore, loadMore }
  → <DataTable data={visibleRows} onReachEnd={hasMore ? loadMore : undefined}>
    → <Table onReachEnd>  renders  <InfiniteScrollSentinel> INSIDE the scroll wrapper
      → useInViewport(sentinel, { rootMargin: "0px 0px 320px 0px" })
        → fires loadMore on the visibility edge
```

The sentinel lives **inside** the `fillBody` scroll wrapper (rendered
by the `Table` primitive after the rows). Observed against the viewport
(`root: null`), an `overflow-y-auto` ancestor still clips it — so it
only intersects when the user scrolls to the bottom of the table body,
and the same code works on mobile's document scroll where there's no
inner clamp. No scroll listeners; one `IntersectionObserver`.

`onReachEnd` is gated by the consumer: `hasMore ? loadMore : undefined`.
Undefined → the `Table` doesn't render the sentinel → the observer
unmounts at the end of the data. The 320px `rootMargin` pre-loads the
next batch just before the bottom so the scroll never visibly stalls.
A windowed batch (50 rows) overflows the viewport, so the sentinel
drops well below the fold after each load and re-arms on the next
scroll — no tight load loop; one fire per crossing (the latest callback
is stashed in a ref so the effect deps stay `[visible]`).

## Files

| File | Role |
|------|------|
| `src/components/ui/hooks/use-in-viewport.tsx` | + optional `rootMargin` forwarded to IntersectionObserver |
| `src/components/ui/table/infinite-scroll-sentinel.tsx` | NEW — the load-on-scroll sentinel |
| `src/components/ui/table/types.ts` | + `onReachEnd?` on `BaseTableProps` |
| `src/components/ui/table/table.tsx` | renders the sentinel inside the scroll wrapper when `onReachEnd` set |
| `src/components/ui/table/data-table.tsx` | + `onReachEnd` prop, forwarded to `<Table>` |
| `src/components/ui/table/index.ts` | barrel-exports the sentinel |
| `src/components/layout/EntityListPage.tsx` | + `onReachEnd` on the table Pick |
| `…/controls,risks,tasks,evidence/*Client.tsx` | swap `<TableLoadMoreFooter>` → `onReachEnd` |
| `…/assets,vendors,policies/*Client.tsx` | add `useThresholdLoadMore` + `onReachEnd` |
| `…/assets/page.tsx`, `…/vendors/page.tsx` | drop the clamp-breaking wrapper `<div>` |
| `tests/guardrails/pr-1-tenant-tables-org-parity.test.ts` | rewritten: locks the load-on-scroll wiring + clamp fix |
| `tests/rendered/infinite-scroll-sentinel.test.tsx` | NEW — sentinel fire-once-per-crossing behaviour |

## Decisions

- **Sentinel inside the `Table` primitive, not the page footer.** The
  footer slot (`tableFooter` / the old button) sat OUTSIDE the scroll
  wrapper — a sentinel there is clipped by `Body`'s `overflow-hidden`
  and never intersects. The only correct spot is inside the scroll
  wrapper at the bottom of the rows, which only the primitive can place.
- **`onReachEnd` passed straight to `<Table>` (not through `useTable`).**
  It's presentational, not table-config; threading it through the
  `useTable` discriminated union would be noise.
- **`TableLoadMoreFooter` kept, not deleted.** The org-level pages
  (`/app/org/...`) still use it with `useCursorPagination` (server
  cursor pagination, where a button is the right affordance). Only the
  tenant in-memory-windowed pages moved to load-on-scroll.
- **No-IO degradation.** `useInViewport` returns `false` without
  IntersectionObserver, so load-on-scroll silently no-ops there. Every
  modern target browser supports IO; this matches the codebase's other
  IO-based affordances.

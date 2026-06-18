# 2026-06-18 — Mobile PR-2: responsive DataTable (stacked card view)

**Commit:** `<sha>` feat(mobile): DataTable collapses to a stacked card list below md

Second PR of the mobile roadmap. Wide tables are the worst mobile surface in a
data app — 5–10 columns overflow or truncate on a 375px viewport. Below `md` a
`<DataTable>` now renders a **stacked card list** (operator-chosen over
column-priority + horizontal scroll): each row is a card, each visible column a
`label → value` line, values wrap (nothing cut).

## Design

`<DataTable>` swaps renderers at runtime based on `useIsBelowMd()`:

```
const belowMd = useIsBelowMd();
if (belowMd && data.length > 0 && !error && !loading) return <DataTableCards … />;
// else the existing <Table> / <VirtualTable>
```

- **`useIsBelowMd`** — `matchMedia('(max-width: 767.98px)')`, starting `false`
  on SSR/first render (hydration-safe). Two deliberate consequences:
  - On a real phone the table paints one frame, then swaps to cards (same
    pattern Modal/Sheet use).
  - Under **jsdom** `matchMedia(...).matches` is `false`, so tests render the
    DESKTOP table by default — every existing table/entity-page test keeps
    working unchanged. (The card branch is exercised by mocking the hook.)
- **`<DataTableCards>`** — renders from the SAME tanstack `table` instance, so
  sort/filter/selection state stay in lockstep; it's a presentation swap, not a
  fork. Columns with a plain-string header become `label → value`; columns whose
  header isn't a string (selection checkbox, action chevron) render full-width.
- **Single tree** — only ONE of table/cards is in the DOM at a time. This was
  the load-bearing choice: an earlier "render both, hide via CSS" attempt
  duplicated cell content (testids/text) in jsdom and broke `getBy*` queries
  across every list-page test. Runtime swap keeps one tree.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/table/use-is-below-md.ts` | SSR/jsdom-safe `< md` viewport hook |
| `src/components/ui/table/data-table-cards.tsx` | the card-list renderer (shared table instance) |
| `src/components/ui/table/data-table.tsx` | runtime swap to cards below md (rows present) |
| `src/components/ui/table/index.ts` | barrel exports |
| `tests/rendered/data-table-mobile-cards.test.tsx` | desktop→table default; mocked phone→cards + full value |
| `tests/guards/mobile-datatable-cards.test.ts` | structural ratchet (gate, hook safety, wrap-not-truncate, shared instance) |

## Decisions

- **Runtime swap, not CSS dual-tree.** jsdom's `matchMedia` returns `false`, so
  `useIsBelowMd` → `false` in tests → the table renders by default and the
  existing suite is untouched. A CSS-hidden dual tree duplicates queryable
  content in jsdom (no layout engine) and breaks `getByText`/`getByTestId`.
- **Card hover uses the canonical `hover:bg-bg-muted/50`** row/card recipe
  (the `hover-recipe-discipline` guard bans off-recipe `hover:bg-bg-*`).
- **Empty/loading/error keep the `<Table>` chrome** even on mobile — only real
  row data collapses to cards.
- **VirtualTable (>1000 rows) stays as-is on mobile** — a phone rarely hits an
  unpaginated 1000-row list; covering it would need a virtualized card list and
  isn't worth the surface for this PR.

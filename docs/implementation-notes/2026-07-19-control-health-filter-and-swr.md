# 2026-07-19 — Control-health filter/drill + dashboard SWR + policy traceability node (PR-Y)

**Commit:** `<sha> feat(controls): server-side health filter + interactive dashboard tiles, dashboard/templates SWR, policy traceability node`

## Design

Control health was surfaced everywhere (list column, dashboard tiles) but not
actionable; two surfaces missed the SWR migration; one traceability node kind
was dead. Four fixes.

### 1 + 4 — Server-side health filter + `?ids=` deep-link (unified)
Both the new **health verdict facet** and the existing **consistency `?ids=`
deep-link** now resolve to a single server-side `id: { in }` restriction:

- `ControlListFilters` gained `ids?: string[]`; `_buildWhere` applies
  `where.id = { in: filters.ids }` — where an EMPTY array is deliberate (a
  requested facet that matched nothing → zero rows), only `undefined` skips.
- `listControls`/`listControlsPaginated` accept URL-shaped `ControlListInputFilters`
  (`ids` comma-string + `health` verdict) and resolve them to the concrete id
  array via `resolveControlIdRestriction` — `health` is resolved through the
  same `getControlHealthVerdicts` data the column + tiles use, then intersected
  with any `ids`. The RAW url strings form the cache key (small); the resolved
  array is used in the loader.
- The controls route schema + SSR `page.tsx` allowlist both carry `ids` +
  `health`, so the SSR read is actually filtered and the client's
  `fallbackData` still matches on first paint (no cold refetch).
- `ControlsClient` drops its client-side `.filter()` over loaded rows (the
  cause of "a flagged control beyond the loaded page is silently hidden") and
  threads `?ids=` into `filtersForQuery` so the server filters it.
- **filter-defs** gained a single-select `health` facet
  (HEALTHY/DEGRADED/AT_RISK/NOT_APPLICABLE/UNKNOWN); **`ControlHealthSummary`**
  tiles deep-link non-zero counts to `/controls?health=<verdict>` (mirrors the
  consistency deep-link — zero tiles stay non-interactive).

### 2 — Dashboard shell + templates → `useTenantSWR`
`dashboard/page.tsx` (hand-rolled 3× retry loop + setState-in-effect +
`fetchConsistency`) and `templates/page.tsx` (`TODO(swr-migration)`) now use
`useTenantSWR` with a skeleton + inline retry (`mutate()`). Consistency is a
conditional-key SWR (`showConsistency ? '/controls/consistency-check' : null`).
The pre-existing SWR islands (`ControlHealthSummary`, `BestValueControls`) are
unchanged; the client-side templates search is preserved.

### 3 — Policy traceability node (drawn, not deleted)
The `policy` node kind was declared (union + category default + count init) but
never produced. **Decision: DRAW it** (PolicyControlLink is a clean, indexed
join and policies have detail pages). `traceability-graph.ts` fetches policies +
`PolicyControlLink` (gated on `wantKinds.has('policy')`), `build.ts` emits a
`policyNode` (real `href` to the policy detail page, status badge) with a
`governs` edge (policy → control). The **Sankey keeps dropping policy** (with an
updated honest comment) — a policy governs controls orthogonally to the linear
asset→risk→control→requirement flow, so it has no natural column; it's rendered
in the graph view.

## Files

| File | Role |
| --- | --- |
| `repositories/ControlRepository.ts` | `ids` filter + `id: { in }` branch |
| `usecases/control/queries.ts` | `health`→ids resolution; `ControlListInputFilters` |
| `api/.../controls/route.ts` | `ids` + `health` query schema |
| `(app)/controls/page.tsx` | SSR allowlist adds `ids` + `health` |
| `(app)/controls/ControlsClient.tsx` | `?ids=` server-side; drop client row filter |
| `(app)/controls/filter-defs.ts` | health verdict facet |
| `(app)/controls/_components/ControlHealthSummary.tsx` | interactive tile deep-links |
| `(app)/controls/dashboard/page.tsx`, `templates/page.tsx` | `useTenantSWR` migration |
| `lib/traceability-graph/{types,build,sankey}.ts` + `usecases/traceability-graph.ts` | policy node draw |
| `messages/{en,bg}.json` | health facet + retry + tile-aria keys |

## Decisions

- **Unify health + ids on one `id: { in }` seam.** The health facet and the
  consistency deep-link are different concepts but share the same server-side
  mechanism; resolving both to an id array keeps `_buildWhere` simple and the
  filtering scalable past the loaded page.
- **Empty array ≠ no restriction.** A requested facet that matched nothing must
  return zero rows, so `_buildWhere` treats `[]` as `id in ()`; only `undefined`
  means "no id restriction".
- **Draw policy, keep it out of the Sankey.** Policy is genuinely useful in the
  graph (governance coverage) but has no linear-flow column — graph-only with an
  honest comment beats forcing an awkward Sankey lane or deleting the kind.
- **Health resolution runs per health-filtered call** (the `getControlHealthVerdicts`
  scan). Acceptable for a deliberate filter action; PR-Z bounds that scan.

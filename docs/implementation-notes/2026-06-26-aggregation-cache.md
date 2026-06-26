# 2026-06-26 — Aggregation response cache

**Commit:** `<pending>` feat(cache): response cache for aggregation endpoints

## Design

Dashboards/metrics aggregate across many entities, so they're a
different caching problem from the existing single-entity list cache
(`cachedListRead`). The new `cachedAggregationRead` composes the version
counters of EVERY entity an aggregation `dependsOn` into one cache key;
a `bumpEntityCacheVersion` on any dependency changes the composed key, so
the next read recomputes. Same version-counter namespace as the list
cache — one bump invalidates both. TTL is the staleness ceiling, the
bump is the primary mechanism.

```
controls/dashboard GET
  → cachedAggregationRead({ scopeKey: tenantId, aggregation: 'controls-dashboard',
                            dependsOn: ['control','evidence','test','task'], ttl: 60 })
      key = agg:controls-dashboard:<tenant>:v[control=N,evidence=M,test=K,task=J]:<paramhash>
  Control write → bumpEntityCacheVersion(ctx,'control') → N++ → key changes → miss → recompute
```

## Files

| File | Role |
|------|------|
| `src/lib/cache/aggregation-registry.ts` | NEW — `AGGREGATIONS` source of truth (dependsOn + TTL + scope), `AggregationEntity` union, `MAX_AGGREGATION_TTL_SECONDS` |
| `src/lib/cache/aggregation-cache.ts` | NEW — `cachedAggregationRead`: version composition, fail-open, no-Redis bypass, metrics |
| `src/lib/cache/list-cache.ts` | refactor — export `entityVersionKey`; widen `bumpEntityCacheVersion` to `AggregationEntity`; add `bumpEntityCacheVersionForScope` (org scope) |
| `src/lib/observability/metrics.ts` | add `cache.aggregation.hit`/`.miss`/`.compute_duration_ms` |
| 9 dashboard/metric `route.ts` | wrap compute in `cachedAggregationRead` |
| `*usecases* (control-test, test-scheduling, vendor, audit-readiness/*, loss-event, org-dashboard-widgets)` | bump the new entities on write |
| `docs/response-caching.md` | operator + contributor runbook |
| `tests/guardrails/aggregation-cache-coverage.test.ts` | ratchet |

## Decisions

- **Shared version namespace, lowercase entity keys.** The aggregation
  cache reuses the list cache's `ver:<entity>:<scope>` counters via the
  exported `entityVersionKey`. This is why a `control` write already
  invalidates `controls-dashboard` with no new wiring — the existing list
  bump does double duty. New entities (`test`, `vendor`, `audit`,
  `lossEvent`, `orgWidget`) had no list cache, so their bumps were added
  in this PR.

- **`dependsOn` is coarse-by-rollup, not one-counter-per-table.** Listing
  `ControlEvidence`/`ControlTest` separately would require new counters
  and bumps for marginal precision; instead `controls-dashboard` depends
  on `control` + `evidence` + `test`, which the sub-entity writes already
  bump. Honest and far less wiring. Trade-off: slightly coarser
  invalidation (a `test` write invalidates `controls-dashboard` even if
  that control test doesn't change a dashboard count) — acceptable at a
  60s TTL.

- **TTL choices.** 60s for the high-churn entity dashboards (controls,
  risks, tests, vendors, tasks, issues, audits) — short enough that even
  a missed bump self-heals fast. 120s for `loss-events-aggregate`
  (lower write rate). 300s for `org-dashboard-widgets` (user-configured
  widgets change rarely). All under the 600s ceiling the ratchet enforces.

- **`variant` added to the helper.** The prompt's sketch omitted it, but
  `tests/dashboard?period=` and `loss-events/aggregate?riskId=` return
  different slices — caching without the query inputs in the key would
  serve the wrong slice. `cachedAggregationRead` hashes `variant` into the
  key. (Named `variant`, not `params`, to avoid the async-params
  route-typing guard's `params: {` regex.)

- **Generic `scopeKey`, not just `tenantId`.** `org-dashboard-widgets` is
  org-scoped (`OrgContext.organizationId`, no `tenantId`). The helper
  takes a `scopeKey` string; tenant aggregations pass `ctx.tenantId`, the
  org one passes `ctx.organizationId`, with a matching
  `bumpEntityCacheVersionForScope` for the org bump.

- **Rollout sequencing.** Ship all nine wired but roll out cautiously:
  enable `controls-dashboard` first in production, watch the hit ratio +
  `compute_duration_ms` for 24h; a hit ratio < 50% means the invalidation
  graph is too eager (fix the `dependsOn` before leaning on the rest).
  The cache is fail-open and TTL-bounded, so the blast radius of a wrong
  call is bounded staleness, never wrong-tenant data (scope is always in
  the key).

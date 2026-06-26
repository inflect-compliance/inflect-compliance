# Response caching

Two Redis-backed caches sit in front of the hottest read paths. Both are
**tenant/scope-scoped, version-invalidated, fail-open**, and bypass
cleanly when `REDIS_URL` is unset (dev/test behave as if uncached).

| Cache | Module | Caches | Key scope |
|-------|--------|--------|-----------|
| **List cache** | `src/lib/cache/list-cache.ts` (`cachedListRead`) | single-entity list reads (controls, risks, evidence, tasks) | tenant + entity-version + filter hash |
| **Aggregation cache** | `src/lib/cache/aggregation-cache.ts` (`cachedAggregationRead`) | cross-entity dashboard / metric aggregations | scope (tenant **or** org) + composed entity-versions + param hash |

This document is the source of truth for the **aggregation cache**. The
list cache is documented inline in its module.

## The aggregation registry

`src/lib/cache/aggregation-registry.ts` (`AGGREGATIONS`) is the canonical
reference for **what invalidates what**. Each entry maps an aggregation
to the entity version-counters it depends on and its staleness ceiling:

| Aggregation | Route | `dependsOn` | TTL | Scope |
|-------------|-------|-------------|-----|-------|
| `controls-dashboard` | `controls/dashboard` | control, evidence, test, task | 60s | tenant |
| `risks-dashboard` | `risks/dashboard` | risk | 60s | tenant |
| `tests-dashboard` | `tests/dashboard` | test | 60s | tenant |
| `vendors-metrics` | `vendors/metrics` | vendor | 60s | tenant |
| `tasks-metrics` | `tasks/metrics` | task | 60s | tenant |
| `issues-metrics` | `issues/metrics` | task | 60s | tenant |
| `audits-readiness-overview` | `audits/readiness/overview` | control, evidence, audit | 60s | tenant |
| `loss-events-aggregate` | `loss-events/aggregate` | lossEvent, risk | 120s | tenant |
| `org-dashboard-widgets` | `org/.../dashboard/widgets` | orgWidget | 300s | org |

`dependsOn` lists the **version counters** the aggregation keys on, not
necessarily one counter per table. Sub-entities roll up to a coarse
counter where the write path already bumps it — e.g. a control↔evidence
link bumps `evidence` (+ `control`), so `controls-dashboard` depending on
`control` + `evidence` covers `ControlEvidence` writes without a separate
counter.

## Staleness contract

- An aggregation is cached for at most its TTL (default 60s). A write to
  any `dependsOn` entity invalidates it **immediately** by bumping that
  entity's version counter — the composed cache key changes, so the next
  read recomputes.
- A user who creates a Control and then views the controls dashboard
  sees the new count: the create path calls
  `bumpEntityCacheVersion(ctx, 'control')`, which the dashboard key
  depends on.
- A **second** user (different session, same tenant) viewing the
  dashboard in the same second sees the bumped version too — the key is
  scope-scoped (tenant or org), **not** user-scoped.
- The one failure mode is a write that does not bump. The ratchet
  `tests/guardrails/aggregation-cache-coverage.test.ts` asserts every
  `dependsOn` entity is bumped by at least one usecase, so the obvious
  cases are caught. A raw `prisma.$executeRaw` write that mutates an
  entity without bumping is the residual gap — code review is the
  backstop. TTL bounds the worst case to `ttlSeconds`.

## Observability

`cachedAggregationRead` emits three OTel instruments (labelled by
`aggregation`, bounded cardinality), defined in
`src/lib/observability/metrics.ts`:

| Instrument | Type | Meaning |
|------------|------|---------|
| `cache.aggregation.hit` | Counter | served from cache |
| `cache.aggregation.miss` | Counter | recomputed |
| `cache.aggregation.compute_duration_ms` | Histogram | cost of a miss |

Watch the per-aggregation hit ratio in Grafana. A sustained low hit rate
means the invalidation graph is over-eager (a `dependsOn` entity churns
far more often than the dashboard is viewed) or the TTL is too short.

## How to add a cached aggregation

1. **Add it to the registry** (`aggregation-registry.ts`): the key, its
   `dependsOn` entities, a TTL ≤ `MAX_AGGREGATION_TTL_SECONDS` (600), and
   the scope. If you need a new entity, add it to the `AggregationEntity`
   union first.
2. **Wrap the route's compute** in `cachedAggregationRead({ scopeKey,
   aggregation, dependsOn, ttlSeconds, variant?, compute })`. Use
   `ctx.tenantId` for tenant scope, `ctx.organizationId` for org scope.
   Pass `variant` for any query arg that changes the result (period,
   filter id) — omitting it serves the wrong slice from cache.
3. **Verify the bumps cover `dependsOn`**: every entity must be bumped by
   the usecase(s) that mutate it (`bumpEntityCacheVersion(ctx, entity)`,
   or `bumpEntityCacheVersionForScope(scopeKey, entity)` for org scope).
   Add the call after the write commits if it's missing.
4. **Add the route to the ratchet** (`ROUTE_FILES` in
   `aggregation-cache-coverage.test.ts`) and run it.

## When NOT to cache here

- **Per-user data.** This cache is scope-scoped, not user-scoped — two
  users in a tenant share an entry. A user-specific dashboard must use
  `cachedDashboardRead` (keys on userId) or no cache.
- **Strong-consistency reads.** Auth context, billing/entitlement state,
  permission checks — never serve these from a TTL cache.
- **Data the user is actively editing.** The bump covers "see your own
  write" at the cache layer; if the underlying repository read uses a
  lagging read replica, that is a separate concern this cache does not
  address.

## Out of scope

- CDN-level caching of `/api/*` (the CDN tier excludes `/api/*` by
  design — see [`docs/cdn.md`](./cdn.md)).
- Per-user aggregation caching.
- Postgres materialised views and scheduled pre-compute — complementary
  techniques, not part of this layer.

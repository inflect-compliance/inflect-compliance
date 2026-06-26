# 2026-06-26 — SSR payload cache with tenant-version invalidation

**Commit:** `<pending>` perf(cache): SSR cache for tenant pages with tenant-version invalidation

## Design

A third cache tier on top of the list + aggregation caches:
`cachedSsrPayload({ tenantId, route, ttlSeconds, compute })`
(`src/lib/cache/ssr-cache.ts`) caches the **data payload** a server
component fetches before handing it to its client island — not the HTML.
Origin-tier (Redis); cuts server-side TTFB. Keyed on
`(tenantId, route, tenant-wide version)`.

New invalidation primitive: a **tenant-wide** version counter
(`tenantVersionKey`, `cache:…:tv:<tenant>`). `bumpEntityCacheVersion`
now bumps BOTH the per-entity counter (list/aggregation caches) AND the
tenant-wide counter (SSR cache) — so any entity write invalidates all of
the tenant's cached SSR payloads. Coarse on purpose (see below).

## Decisions

- **Coarse, tenant-wide invalidation.** An SSR page aggregates across
  entities (dashboard = control counts + risk figures; risks page =
  risk-coverage derived from controls). A Control write must refresh both
  → tenant-wide bump is the right granularity. Bump fires pre-response,
  so staleness < 1s.

- **Dashboard is the real win; list pages are marginal.** The HONEST
  STARTING POINT said aggregation endpoints don't cache — but the
  aggregation cache (#1269) and list cache already landed. After
  re-checking, the only genuinely-uncached hot path is
  `getExecutiveDashboard` (~11 COUNT queries, not list-cached) → cached
  always. The 5 list pages' data is ALREADY list-cached, so SSR-caching
  them only saves payload assembly; wired per the task but gated to the
  **unfiltered** load (filtered requests bypass — the key carries no
  filter, and list-cache covers filtered DB reads). Documented honestly
  rather than overclaiming a DB win on list pages.

- **Per-tenant key is safe for the dashboard.** Verified
  `getExecutiveDashboard` references no `ctx.userId` / notification /
  assignee data — it's tenant-pure, so a tenant-scoped (not user-scoped)
  key cannot leak one user's data to another. (The older
  `cachedDashboardRead` keyed on userId for a different, user-bearing
  payload; not reused here.)

- **TTLs bounded.** 60s dashboard / 30s lists; `MAX_SSR_TTL_SECONDS = 300`
  clamps any call. Ratchet enforces the cap.

- **Measurement deferred (honest).** Same as the rest of the perf push:
  no baseline RUM exists yet (instrumentation just landed), so real
  before/after `LCP p95` + the SSR hit ratio are a post-deploy checklist
  item, not fabricated numbers.

## Files

| File | Role |
|------|------|
| `src/lib/cache/ssr-cache.ts` | NEW — `cachedSsrPayload`, fail-open, no-Redis bypass, metrics |
| `src/lib/cache/list-cache.ts` | `tenantVersionKey` + `bumpTenantCacheVersion`; `bumpEntityCacheVersion` now bumps both counters |
| `src/lib/observability/metrics.ts` | `cache.ssr.hit` / `.miss` / `.duration` + record fns |
| 6 server components | dashboard (always) + risks/controls/assets/policies/tasks (unfiltered) wrap the data fetch |
| `docs/response-caching.md` | SSR cache section |
| `tests/guardrails/ssr-cache-coverage.test.ts` | ratchet |

## Verification

`npx jest tests/guardrails/ssr-cache-coverage.test.ts` + `tsc --noEmit`.
Local smoke: load /dashboard twice → `cache.ssr.hit`; create a Control →
next /dashboard load is a miss (tenant bump invalidated). Post-deploy:
SSR hit ratio in Grafana + `/dashboard` LCP p95 delta once a baseline
exists.

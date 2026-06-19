# 2026-06-19 — perf(PR3): data-heavy page wins

**Commit:** `<sha> perf(PR3): data-heavy page wins — dashboard waterfalls, cache, lazy charts, RLS round-trips`

**Issue:** #1112 (PR3 of the "make pages feel instant" initiative; see
`docs/implementation-notes/2026-06-17-web-vitals-rum.md` and
`[[project_perf_instant_pages]]`). The server-side / data-heavy wins, now that
RUM (#1109) confirms the executive dashboard is the heaviest route.

## Four wins

### 1. RLS `set_config` round-trips (3 → 2 per context)
`runInTenantContext` opened a transaction and issued `SET LOCAL ROLE app_user`
plus **two separate** `SELECT set_config(...)` round-trips (`app.tenant_id`,
`app.request_id`). The two GUC writes are now a **single** round-trip —
`SELECT set_config('app.tenant_id', …, true), set_config('app.request_id', …, true)`.
The executive dashboard opens ~6 such contexts, so this removes ~6 round-trips
per load. RLS isolation is unchanged (same transaction-local GUCs, same role);
proven by the existing `tests/integration/rls-middleware.test.ts` (20 assertions
green). Prisma's `$executeRaw` cannot run multiple semicolon-separated
statements, so `SET LOCAL ROLE` deliberately stays its own statement — only the
two function calls were merged.

### 2. Dashboard query waterfalls → parallel
- `DashboardRepository.getStats()` ran a 6-count `Promise.all` followed by
  **5 sequential awaits** (highRisks, pendingEvidence, overdueEvidence,
  clauseProgress, unreadNotifications). All 11 now run in one `Promise.all`.
- `dashboard/page.tsx` awaited `getComplianceTrends` **after** the
  `exec + matrixConfig` batch. Trends now join the same `Promise.all`, staying
  best-effort via `.catch(() => null)` on the trends promise.

### 3. Short-TTL dashboard cache
New `cachedDashboardRead` in `src/lib/cache/list-cache.ts` — a **pure-TTL**
(30 s) sibling of `cachedListRead`. Pure TTL (no version counter) because the
executive payload aggregates ~13 entity types; per-write invalidation across
all of them is impractical, and a short TTL bounds staleness acceptably for an
executive summary. **Keyed by `(tenant, user)`** — the payload carries the
actor's unread-notification count, so a tenant-only key would leak across users.
`getExecutiveDashboard` wraps its read in it; `assertCanRead` stays OUTSIDE the
cache so authorization is enforced on every call. Bypassed entirely without
Redis, so dev/test behaviour is unchanged.

### 4. Lazy-load charts
`DashboardClient` now imports `DonutChart`, `RiskMatrix`, `ExpiryCalendar`, and
`TrendCard` via `next/dynamic` with `ssr: false` + sized `Skeleton` fallbacks.
The heavy visx/motion code splits into separate chunks loaded after the
KPI/hero/next-best-action shell (which stays statically imported and renders
instantly). Skeletons are min-height-sized to avoid CLS.

## Files

| File | Change |
| --- | --- |
| `src/lib/db-context.ts` | Merge the two `set_config` writes into one round-trip in `runInTenantContext`. |
| `src/app-layer/repositories/DashboardRepository.ts` | `getStats` — fold 5 sequential counts into the `Promise.all`. |
| `src/app/t/[tenantSlug]/(app)/dashboard/page.tsx` | Trends fetched inside the `Promise.all` batch (`.catch(() => null)`). |
| `src/lib/cache/list-cache.ts` | New `cachedDashboardRead` (pure short-TTL, tenant+user key, fail-open). |
| `src/app-layer/usecases/dashboard.ts` | Wrap `getExecutiveDashboard` read in `cachedDashboardRead` (authz outside). |
| `src/app/t/[tenantSlug]/(app)/dashboard/DashboardClient.tsx` | Lazy-load the 4 heavy charts via `next/dynamic` (ssr:false) + skeletons. |
| `tests/guards/perf-pr3-data-heavy.test.ts` | New ratchet locking all four invariants. |

## Decisions

- **Did NOT batch via `set_config('role', …)`** to get 3→1. Equivalent in
  principle, but relying on intra-`SELECT` evaluation order for a mid-statement
  role switch is murkier than the unambiguous 3→2 merge. RLS isolation is
  load-bearing — the conservative win was the right call.
- **Pure TTL, not version-counter invalidation, for the dashboard cache** — the
  aggregate spans too many entities to bump reliably from every write path.
  Staleness ≤ 30 s is acceptable for an executive summary.
- **`ssr: false` (not `ssr: true`) for the charts** — keeps the heavy chart JS
  off both the server render and the initial critical path. KPI numbers stay
  SSR'd + synchronous, so the dashboard's "instant numbers" character is
  preserved; only the chart areas show a brief sized skeleton.
- **RAF-gating of `useChartFlow`/`useChartSheen` was NOT included** — it was a
  roadmap candidate but not in this issue's four-item scope, and background tabs
  already pause RAF in the browser. Left for a follow-up if RUM shows it matters.
- **Bundle-analyzer wiring** also left out of scope (diagnostic, not a user-
  facing win).

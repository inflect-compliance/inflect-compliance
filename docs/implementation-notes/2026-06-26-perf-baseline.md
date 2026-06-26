# 2026-06-26 — Perf measurement foundation (RUM + slow-query + bundle analyzer)

**Commit:** `<pending>` feat(perf): RUM + slow-query log + bundle analyzer (measurement foundation)

## Design

Pure instrumentation — **zero optimization ships here**. The goal is to
make later perf claims falsifiable: you cannot prove a gain without a
baseline. Four measurement surfaces:

1. **RUM (real-user Web Vitals).** `web-vitals` (`src/lib/observability/rum.ts`)
   fires on LCP/FCP/INP/TTFB/CLS settle → `navigator.sendBeacon('/api/rum')`
   → 5 OTel histograms (`web_vitals.*`). Mounted once via `<RumInit />` in
   the root layout.
2. **Slow-query log.** `src/lib/prisma.ts` enables query events and logs +
   counts (`db.slow_query.count`) any query over 50ms.
3. **Bundle analyzer.** `@next/bundle-analyzer` wraps `next.config.js`;
   `npm run analyze` emits `.next/analyze/*.html`; a `perf-watch`-gated CI
   job publishes it.
4. **Baseline doc.** `docs/perf/` — the dated baseline lands later, after
   a week of RUM data (this PR ships only the directory + methodology).

## Decisions

- **Cardinality discipline.** Metric labels are bounded by construction:
  `route` is normalized (`normalizeRoute` — already in metrics.ts —
  collapses the tenant slug + UUIDs/opaque ids), `ua` is coarse
  (Desktop/Mobile/Tablet, never the full UA string), `rating` is the
  web-vitals three-valued enum. The slow-query counter carries only
  `model`, never the SQL. No per-user labels anywhere — these are
  aggregate distributions, not user trails.

- **50ms slow-query threshold.** Typical Prisma p99 sits at 5-20ms; 50ms
  is the "this query is suspicious, look at it" line, not a per-request
  SLO. One constant (`SLOW_QUERY_THRESHOLD_MS`) so it's tunable once the
  baseline shows the real distribution.

- **Slow-query log is INTERNAL only.** `e.query` is raw SQL and `e.params`
  are bound values that MAY contain PII. Both are truncated hard (500 /
  200 chars) and go to the local operational log + a model-only counter —
  **never** to per-tenant SIEMs via the audit-stream. Only the bounded
  `model` label reaches Prometheus.

- **`/api/rum` is unauthenticated + rate-limit-exempt.** Requiring auth
  would drop pre-login / sign-in-page measurements (the most
  latency-sensitive). It carries no credentials, returns 204, and opts
  out of the mutation limiter (`rateLimit: false`) because a session
  emits ~50 beacons; the read limiter never applies (it targets tenant
  GETs). Malformed beacons are accepted-and-dropped, never errored.

- **1-week baseline window.** Histograms need real per-route traffic
  before percentiles are meaningful, so the dated `baseline-*.md` is a
  follow-up commit, not part of this PR. Every later phase's PR cites a
  delta against it.

## Files

| File | Role |
|------|------|
| `src/lib/observability/rum.ts` | NEW — `initRum`, the Web Vitals beacon |
| `src/components/observability/RumInit.tsx` | NEW — client mount-once wrapper |
| `src/app/api/rum/route.ts` | NEW — beacon sink → histograms, 204 |
| `src/lib/observability/metrics.ts` | 5 `web_vitals.*` histograms + `db.slow_query.count` + record fns |
| `src/lib/prisma.ts` | query-event log config + 50ms slow-query listener |
| `next.config.js` + `package.json` | `withBundleAnalyzer` + `analyze` script |
| `.github/workflows/bundle-analyze.yml` | report artefact (main + `perf-watch` PRs) |
| `docs/perf/README.md` | baseline methodology |
| `tests/guardrails/perf-instrumentation-coverage.test.ts` | ratchet |

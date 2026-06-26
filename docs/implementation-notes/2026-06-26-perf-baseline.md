# 2026-06-26 — Perf measurement foundation (slow-query log + bundle analyzer)

**Commit:** `<pending>` feat(perf): slow-query log + bundle analyzer (measurement foundation)

## Design

Pure instrumentation — **zero optimization ships here**. The goal is to
make later perf claims falsifiable. Of the four measurement surfaces the
perf push needs, one (RUM) **already exists on main**; this PR adds the
two that didn't, plus the baseline-doc home.

1. **RUM — already on main, NOT duplicated.** `<WebVitalsReporter>`
   (`next/web-vitals` `useReportWebVitals`, mounted in
   `ClientProviders`) beacons Core Web Vitals + Next nav metrics to
   `POST /api/telemetry/vitals`, recorded as `web.vitals.*` histograms by
   `src/lib/observability/web-vitals.ts`. This PR references it (in the
   ratchet + baseline doc) but adds no second RUM path.
2. **Slow-query log (new).** `src/lib/prisma.ts` enables Prisma query
   events and logs + counts (`db.slow_query.count`, by model) any query
   over 50ms.
3. **Bundle analyzer (new).** `@next/bundle-analyzer` wraps
   `next.config.js`; `npm run analyze` emits `.next/analyze/*.html`; a
   `perf-watch`-gated CI job publishes it.
4. **Baseline doc home (new).** `docs/perf/` + methodology; the dated
   baseline lands later, after a week of RUM data.

## Decisions

- **No duplicate RUM.** The original plan was to add `web-vitals` +
  `/api/rum` + a `<RumInit>`, but main already shipped an equivalent,
  better RUM (rate-limited, batch beacons, Next nav metrics, no extra
  dependency). Building a second one would split the data across two
  metric namespaces. Dropped the duplicate entirely.
- **50ms slow-query threshold.** Typical Prisma p99 is 5-20ms; 50ms is
  the "this query is suspicious" line, not a per-request SLO. One tunable
  constant (`SLOW_QUERY_THRESHOLD_MS`).
- **Slow-query log is INTERNAL only.** `e.query` is raw SQL and
  `e.params` are bound values that MAY contain PII. Both truncated hard
  (500 / 200 chars) → local operational log + a `model`-only counter,
  **never** shipped to per-tenant SIEMs via the audit-stream.
- **`db.slow_query.count` is `diagnosticOnly`** in the epic19-coherence
  guard — a performance diagnostic watched ad-hoc, not an SLO-board
  metric.
- **1-week baseline window.** Histograms need real per-route traffic
  before percentiles are meaningful, so the dated `baseline-*.md` is a
  follow-up commit.

## Files

| File | Role |
|------|------|
| `src/lib/prisma.ts` | query-event log config + 50ms slow-query listener (`SLOW_QUERY_THRESHOLD_MS`, `parseModelFromSql`) |
| `src/lib/observability/metrics.ts` | `db.slow_query.count` counter + `recordSlowQuery` |
| `next.config.js` + `package.json` | `withBundleAnalyzer` + `analyze` script |
| `.github/workflows/bundle-analyze.yml` | report artefact (main + `perf-watch` PRs) |
| `docs/perf/README.md` | baseline methodology |
| `tests/guardrails/perf-instrumentation-coverage.test.ts` | ratchet (asserts existing RUM + new slow-query + bundle) |

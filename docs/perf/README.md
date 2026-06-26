# Performance baselines

This directory holds dated performance baselines —
`baseline-<YYYY-MM-DD>.md` — captured from real-user metrics. Each
baseline is the source of truth a later optimization PR measures its
delta against ("p95 LCP for /dashboard was 1850ms; after Phase 2 it's
Xms").

## How a baseline is captured

The measurement foundation relies on three surfaces:

1. **RUM** (already on main) — `<WebVitalsReporter>` (via
   `next/web-vitals`) beacons Core Web Vitals to
   `POST /api/telemetry/vitals` (`src/lib/observability/web-vitals.ts`),
   feeding the `web.vitals.*` histograms in Prometheus.
2. **Slow-query log** (this PR) — `src/lib/prisma.ts` logs + counts
   queries over 50ms (`db.slow_query.count`, labelled by model).
3. **Bundle analyzer** (this PR) — `npm run analyze` writes
   `.next/analyze/*.html`; the `Bundle Analyze` workflow publishes it as
   an artefact.

A baseline is captured **after these have run in production for at least
one week**, so the histograms hold enough real traffic per route:

- Query Prometheus for p50/p95/p99 of each Web Vital, per top-20 route
  (route labels are already normalized — tenant slug + ids collapsed).
- Pull the per-route First Load JS from the latest `npm run analyze`.
- Pull the top-20 slow queries by p95 from the slow-query data.
- Drop the numbers into `baseline-<date>.md` using the section layout
  below.

## Baseline file layout

```
# Perf baseline — YYYY-MM-DD
## Methodology        (RUM window, source, normalization, exclusions)
## Per-route Web Vitals   (LCP p50/p95, INP p95, TTFB p95, samples)
## Per-route bundle weights  (First Load JS, page chunk, shared chunk)
## Slow queries (top 20)     (model, p95 ms, calls/day, truncated query)
## Notes                 (routes excluded + why)
```

The first dated baseline lands as a separate commit once the one-week
window closes — this phase ships the instrumentation, not the numbers.

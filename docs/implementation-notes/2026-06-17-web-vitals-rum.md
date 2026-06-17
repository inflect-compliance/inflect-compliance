# 2026-06-17 — Web-vitals RUM (page-load measurement)

**Commit:** `<pending>` perf(obs): client web-vitals + nav-timing RUM sink

## Design

First deliverable of a "make pages feel instant" initiative. The app already
had **server-side** request metrics (OTel `http.request.duration` at the API
boundary) but **no client-perceived** page-load timing — so "pages feel slow"
couldn't be attributed to a page or a phase. This adds Real User Monitoring so
the subsequent optimization PRs are aimed by data, not guesses.

```
<WebVitalsReporter/> (client, in ClientProviders)
  └ useReportWebVitals  (next/web-vitals — no new dependency)
       ├ Core Web Vitals: LCP · INP · CLS · FCP · TTFB
       └ Next.js custom:  hydration · route-change-to-render · render
                          (the in-app-navigation "feels slow" signal)
  └ navigator.sendBeacon → POST /api/telemetry/vitals   (survives nav unload)
        └ recordWebVital()  → OTel histogram web.vitals.<name> (no-op if OTel off)
                            → structured `web_vital` log line (always visible)
```

Each sample carries `window.location.pathname`; the server normalizes it to a
bounded route label (`/t/[tenant]/controls/[id]`) so we get per-route timing
without cardinality blowup.

## Files

| File | Role |
|------|------|
| `src/lib/observability/web-vitals.ts` | recorder: allowlist, route normalizer, per-metric histogram (lazy), `log` sink, per-IP beacon limiter |
| `src/app/api/telemetry/vitals/route.ts` | public POST sink — size-capped, allowlisted, rate-limited, always 204 |
| `src/components/observability/WebVitalsReporter.tsx` | client — `useReportWebVitals` → sendBeacon; inert in test mode |
| `src/components/layout/ClientProviders.tsx` | mounts the reporter app-wide (tenant app) |
| `tests/unit/observability/web-vitals.test.ts` | ratchet: allowlist, route normalization, validation, limiter |

## Decisions

- **No new runtime dependency.** `useReportWebVitals` ships with Next; the
  `web-vitals` lib is bundled by it. OTel `metrics.getMeter` returns a no-op
  meter when no SDK is registered, so `.record()` is zero-cost when OTel is off
  — and we still get the `web_vital` log line either way.
- **Public + best-effort endpoint, NOT `withApiErrorHandling`.** Beacons fire
  without credentials (often during unload), so no auth/CSRF. The wrapper's
  60/min mutation limit would throttle legitimate traffic (~8 vitals/page over
  rapid nav), so a dedicated `acceptVitalBeacon` limiter (240/min/IP) is used
  instead. Always 204, swallow all errors — telemetry must never break a page.
- **Cardinality bounded by construction.** Metric name allowlisted (8),
  route normalized (tenant slug + cuid/uuid/numeric ids collapsed), rating is
  the 3-value CWV band. No per-tenant / per-user labels.
- **Deferred:** `@next/bundle-analyzer` (a dev tool for the later bundle-trim
  PR) was kept out of this PR so the measurement change stays dependency-free.

## Next (the initiative this measures)

PR2 — instant nav: `loading.tsx` for the 11 detail routes lacking one; row
hover-prefetch + `useTransition`; `optimizePackageImports` for visx/motion.
PR3+ — data-heavy: parallelize dashboard/layout query waterfalls; short-TTL
dashboard cache; lazy-load charts; (carefully) batch the per-call RLS
`set_config` round-trips.

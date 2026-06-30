# 2026-06-30 — Instant navigation via the client Router Cache

**Commit:** `<pending> perf(nav): prefetch full RSC + hold dynamic routes in the client router cache`

## Problem

Navigation between the hot app pages (controls, risks, evidence, …)
felt like ~0.5 s — "nowhere near instant", versus a pure client SPA
(e.g. tidalcontrol) that navigates with zero perceptible delay.

Epic 69 (SWR) + hover data-prefetch already made the *data* warm, but
navigation still felt slow. Measurement on prod isolated why:

- `TTFB ≈ 276 ms` for a tenant page navigation (server render + network).
- The SSR list query is **not** the cost — it is already
  `cachedSsrPayload`-cached (30 s TTL). The cost is the **per-navigation
  RSC server round-trip itself**, inherent to the `force-dynamic` +
  auth App Router model: every click re-renders the route on the server.

So the lever is not "stop fetching the list server-side" (it's cached);
it is "stop doing a server round-trip on every navigation."

## Design

Two config-level changes, no per-page refactor:

1. **`experimental.staleTimes.dynamic = 30` (`next.config.js`).** The
   hot routes are `force-dynamic`, whose default client Router Cache
   stale time is `0` — Next discards the prefetched/visited RSC
   immediately, so every back/forward or re-navigation re-runs the full
   server render. Holding the dynamic RSC in the client cache for 30 s
   means a re-navigation renders from cache (instant). `static = 180`
   for the few static routes. 30 s mirrors the `cachedSsrPayload` TTL so
   the SSR cache and the client cache expire in lockstep.

2. **`prefetch` on the sidebar nav `<Link>` (`nav-item.tsx`).** Forces a
   *full*-RSC prefetch rather than the loading-boundary-only slice Next
   prefetches by default for dynamic routes. The sidebar is always in
   the viewport, so every hot route prefetches its RSC into the client
   router cache on mount — the **first** click is then served from
   cache too, not just repeat visits.

The Epic-69 SWR layer is the partner that makes the 30 s staleness safe:
the router-cached RSC may carry an up-to-30 s-stale initial list, but
SWR revalidates the data on mount/focus, so the visible list is never
more than one fetch stale, and mutations already `mutate()` the cache.
Router-cache staleness only affects the first paint's shell + seed list,
which SWR immediately supersedes.

## Files

| File | Role |
| --- | --- |
| `next.config.js` | `experimental.staleTimes` — hold dynamic RSC in the client router cache 30 s |
| `src/components/layout/nav-item.tsx` | `prefetch` on the nav `<Link>` — full-RSC prefetch on mount |

## Decisions

- **Config lever over the SSR-strip refactor.** The original plan was to
  strip server-side `initialData` from ~8 list pages and render purely
  from the SWR cache. Measurement showed the SSR list is already cached,
  so that refactor (invasive — moving permissions/filters off props
  across 1300-line client components, on 35 `force-dynamic` pages) would
  not have removed the round-trip. The router-cache approach removes the
  round-trip directly, is two lines, and is fully reversible.
- **30 s, not longer.** Bounds how stale a re-navigated shell can be and
  matches the existing SSR cache TTL. Longer would widen the window
  where a router-cached page shows a stale shell before SWR refreshes.
- **Prefetch cost is bounded.** `prefetch` on ~13 nav links fires
  background full-RSC renders on page load, but each hits the 30 s
  `cachedSsrPayload` cache (no DB list query) and is deduped by the
  router cache, so the steady-state cost is one cheap render per route
  per 30 s, not per page view.
- **Rollback:** revert both edits — behaviour returns to per-navigation
  server render. No data, schema, or API surface touched.

## Follow-up

If this measurably delivers instant nav (prod TTFB on re-nav drops to
~0 from cache; user-perceived "Explorer-instant"), the gated PR-2..5
(SSR-strip per entity) are likely **unnecessary** and should be closed —
the round-trip is already eliminated. Re-measure before deciding.

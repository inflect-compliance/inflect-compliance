# 2026-06-20 — Page-load budget probe (instant-pages loop engine)

**Commit:** `<sha> perf: page-load budget probe — per-route server-TTFB measurement`

The measurement engine for the "make every page feel instant" loop. Continues
the perf initiative (`[[project_perf_instant_pages]]` — PR1 RUM, PR2 instant-nav,
PR3 data-heavy wins).

## What it measures

`tests/e2e/page-load-budget.spec.ts` logs in once and visits every tenant route
(static routes directly; detail routes with an id pulled from the matching list
API), recording the **server response time** —
`response.request().timing().responseStart - requestStart` (≈ TTFB). That's the
part the app controls and the lever that makes a page feel instant; a full
network page-load can't be 100 ms, but the server response can.

## Targets + how the loop uses it

- **≤100 ms** per route is the goal; **≤200 ms** is the fallback for genuinely
  data-heavy pages where 100 ms isn't attainable after a real optimization pass
  (tracked in `FALLBACK_ROUTES`, each entry justified).
- The probe **reports** the per-route number (test log + `test-results/page-load-budget.json`)
  and asserts only a generous **gross-regression ceiling** (1500 ms). Hard-asserting
  the tight budgets on every route on day one would red-CI the whole suite before
  the optimization passes land; the per-route budgets are the ratcheted ledger,
  driven down PR by PR.

## The optimization playbook (per route, applied as the loop runs)

Reuses the PR3 wins, generalized:
- parallelize server-component data fetches (`Promise.all`, kill waterfalls);
- short-TTL per-(tenant[,user]) caches for aggregate reads (`cachedDashboardRead` pattern);
- lazy-load heavy client components (`next/dynamic`);
- the RLS `set_config` round-trip cut (PR3) already benefits every route;
- add/repair indexes behind the hottest list filters.

## Decisions

- **Server TTFB, not full page-load**, is the metric — controllable, repeatable,
  and the true "instant feel" lever. Stated explicitly so the budgets aren't
  misread as full-load times.
- **Report + ceiling, not hard per-route assertions (yet)** — the budgets ratchet
  down as routes are optimized; a flaky CI runner shouldn't red-CI a tight
  per-route timing on day one.

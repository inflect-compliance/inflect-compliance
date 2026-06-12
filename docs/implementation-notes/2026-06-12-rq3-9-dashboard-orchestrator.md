# 2026-06-12 — RQ3-9 — Dashboard orchestrator + the score-0-25 ladder dies

**Commit:** `pending` (branch `claude/rq3-9-dashboard-orchestrator`)

## Design

The risk dashboard mounted with six independent `useEffect(fetch(...))`
waterfalls (one per widget: risks list, analytics, coherence, staleness,
appetite, latest simulation), each owning its own failure-soft `null` state.
The page-side narrative was that the failures didn't cascade — but the
costs did: six round-trips on every dashboard mount, six places where a
fetch-and-setState race could land out of order, and six useEffects whose
dependency arrays the linter routinely flagged.

This PR replaces that waterfall with one orchestrator usecase
(`getRiskDashboard(ctx)`) that fans out via `Promise.allSettled`. The
page consumes it via a single `useTenantSWR<DashboardPayload>('/risks/dashboard')`
call. The failure-soft contract is preserved per slot: a thrown
analytics branch still becomes `null` in the response, the page still
treats `null` as "not ready yet", and the widgets render independently
of each other's state.

### Why the matrix slot is fatal-on-throw

Every other slot collapses to `null` on rejection — the page already
handles missing data gracefully for those. The matrix config is
different: the heatmap can't render without bands (every cell asks
`resolveBandForScore(score, matrix.bands)` for its tone). A rejected
matrix branch is genuinely exceptional (the usecase itself returns
`cloneConfig(DEFAULT_RISK_MATRIX_CONFIG)` when the row is missing —
so the only way to throw is a DB error), and the orchestrator
escalates by rethrowing.

### Appetite is an envelope

The legacy `/risk-appetite` route returns `{ config, status }` — two
parallel reads bundled at the route layer. The orchestrator preserves
that envelope: the appetite slot is null when **either** leg fails
(the panel needs both to render). The test pins both legs.

### The score-0-25 ladder is dead

`getStatusTone(s, 'score-0-25')` hard-coded `≤5 / ≤12 / ≤18 / >18`
thresholds for the dashboard heatmap. The tenant's matrix config
already defines the canonical bands (per `resolveBandForScore`) —
having a second source of truth for "what colour is a risk score"
was a drift risk waiting to happen. This PR:

  - Removes `'score-0-25'` from the `StatusScale` union.
  - Replaces the dashboard's `HEATMAP_COLOR(s)` ladder with
    `heatmapClassForBand(band)` — same semantic-token palette
    (`bg-bg-success` / `bg-bg-warning` / `bg-bg-warning/60` /
    `bg-bg-error`), but the band lookup uses the tenant's
    canonical thresholds.
  - Keeps `getStatusTone` for its surviving scales (`pct-0-100`,
    `pass-rate-0-100`, `count-attention`) — Coverage still consumes
    it; that scale is genuinely about coverage percentages, not
    risk scores.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/risk-dashboard.ts` | Orchestrator usecase: fan-out + payload typing |
| `src/app/api/t/[tenantSlug]/risks/dashboard/route.ts` | GET endpoint |
| `src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx` | Six useEffects → one useTenantSWR; heatmap uses band resolver |
| `src/lib/design/status-tone.ts` | `score-0-25` scale removed from union |
| `tests/unit/risk-dashboard-orchestrator.test.ts` | 7 fan-out + failure-soft + envelope assertions |
| `tests/guards/rq3-9-dashboard-orchestrator.test.ts` | 7 structural ratchets |
| `tests/unit/lib/design/status-tone.test.ts` | Removed the score-0-25 describe block |
| `tests/guards/rq2-5-coherence.test.ts` | Updated to assert orchestrator pulls coherence |
| `tests/guards/rq2-8-staleness.test.ts` | Updated to assert orchestrator pulls staleness |
| `tests/guardrails/b10-advanced-analytics.test.ts` | Updated to assert orchestrator pulls analytics |
| `tests/rendered/risk-dashboard-portfolio-honesty.test.tsx` | Mocks orchestrator payload; wraps in `SWRConfig` |

## Decisions

- **Promise.allSettled, not Promise.all.** Per-slot failure-soft is the
  invariant. `Promise.all` would short-circuit on the first rejection,
  which is the opposite of what the page needs — a slow simulation
  must not block staleness from rendering.
- **Bands by NAME, not score thresholds.** The semantic-token mapping
  uses `band.name` (`'Low' | 'Medium' | 'High' | 'Critical'`) as its
  lookup key. The names are the contract (the matrix config seeds them
  by convention); thresholds vary per tenant. A tenant who customises
  thresholds to `Low: 1-10, Medium: 11-20, High: 21-25` gets the
  right tone without a code change.
- **No hex threading through inline styles.** The matrix config's
  `band.color` is a CSS hex — we deliberately do NOT thread it through
  `style={{ background: band.color }}`. Inline styles bypass dark-mode +
  the WCAG-AA contrast guarantees baked into the semantic tokens. The
  name-to-token mapping keeps the heatmap in the design system.
- **The legacy endpoints stay.** `/risks/coherence`, `/risks/staleness`,
  `/risks/analytics`, `/risk-appetite`, `/risks/simulate` continue to
  serve their non-dashboard consumers. RQ3-9 adds a new orchestrator
  endpoint that calls the same usecases; it doesn't replace the per-
  resource routes.
- **`SWRConfig` provider in the rendered test.** The default SWR cache
  is module-global; in a multi-test file two `mockFetch(...)` calls
  with different bodies would otherwise see each other's cached data.
  Wrapping `<RiskDashboardPage>` in `<SWRConfig value={{ provider:
  () => new Map() }}>` gives each test a fresh cache.

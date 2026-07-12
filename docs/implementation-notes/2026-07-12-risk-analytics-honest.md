# 2026-07-12 — Make the risk-analytics pages honest, self-explaining, findable

**Commit:** _(P3 of the risk-domain roadmap)_

## Design

The risk-analytics pages fetched with raw `fetch(...).catch(() => {})`, so a
load failure rendered as an empty register indistinguishable from a
genuinely empty tenant; the analytical concepts were shown cold; and the
views hid behind ~8 tooltip-only icon buttons.

- **Honest data fetching.** All six pages (scenarios, hierarchy, kri,
  correlations, loss-events, reports) migrate to `useTenantSWR` and render
  through a shared `<AnalyticsState>` — skeleton while loading, a visible
  error on failure, a typed empty state otherwise. A failed load can never
  again read as "empty". Mutations refresh via `mutate()`.
- **Concept guidance.** `<InfoTooltip>` next to each cold term: what a KRI
  is (and threshold direction), what a correlation matrix + positive
  semi-definite mean, what a loss event is (and that it's a scoreboard),
  what a scenario is (a set of overrides), what a hierarchy node is. The
  correlations title truncation is fixed — the hard `.slice(0, 8)` /
  `.slice(0, 12)` character cuts are gone; titles use CSS `truncate` + the
  full-title tooltip so risks are identifiable.
- **Findability.** The ~8 tooltip-only view icons collapse into a labeled
  **"Views ▾"** menu (grouped under "Analytics").
- **AI-Systems re-shelf.** AI-Systems is an EU AI Act registry, not a
  risk-analytics view over the register — it's moved into its own labeled
  "Registry" section of the Views menu, separated from the analytics.

## Decisions

- **One shared `<AnalyticsState>`** rather than per-page error/skeleton
  branches — keeps the three honest states identical across pages and makes
  the ratchet a one-line `<AnalyticsState>` presence check per page.
- **Menu wraps the list body only.** The create form above each list stays
  usable even while the list is loading or errored.
- **AI loadAssets premise was stale** — `AiSystemsClient` is already
  server-rendered (no client fetch), so there was nothing to migrate there;
  the re-shelf (its discoverable home) is the genuine AI-Systems slice.

## Files

| File | Role |
|---|---|
| `.../risks/_shared/AnalyticsState.tsx` | NEW — shared load/error/empty |
| `.../risks/{scenarios,hierarchy,kri,correlations,loss-events,reports}/page.tsx` | useTenantSWR + AnalyticsState + concept tooltips |
| `.../risks/correlations/page.tsx` | truncation fix + PSD/matrix tooltips |
| `.../risks/RisksClient.tsx` | labeled Views menu + AI-Systems Registry entry |
| `messages/{en,bg}.json` | concept copy, per-page loadError, Views-menu labels |
| `tests/guards/p3-risk-analytics-honest.test.ts` | structural ratchet |

# 2026-07-09 — GAP-3: per-connection DB-backed freshness gauge + admin health view

**Commit:** _(pending)_ `feat(integrations): per-connection freshness gauge + admin health view`

## Design

The H6 gauge `integration.check.staleness_seconds` is **per-provider** and
**in-memory** (`_lastOutcomeMs[provider]` in `integration-metrics.ts`): it
tracks the last outcome *this process* observed, so it resets on restart and
can't distinguish two connections of the same provider — or see a connection
that has never emitted in this process. GAP-3 adds the durable,
per-**connection** view, read from Postgres.

```
integration.connection.freshness_seconds{connection, provider}
  = seconds since the last SUCCESSFUL (PASSED) IntegrationExecution
    for each ENABLED IntegrationConnection
```

Two consumers of the same signal:

1. **OTel observable gauge** (platform-wide, for alerting). Registered at
   startup in `instrumentation.ts`. The callback runs two bounded queries per
   scrape via the base `prisma` client (RLS-bypassing, like automation-runner,
   because it reports across every tenant): all enabled connections + a
   grouped `max(PASSED)` per connection. Never a per-connection query in a
   loop. Series are ranked stalest-first and capped at `MAX_FRESHNESS_SERIES`
   (1000) — `connection` is a per-id label, necessarily high-cardinality, so
   the cap bounds the metric on a large fleet and logs a truncation (never
   silent). Fail-safe: a DB blip skips the scrape.

2. **Admin health view** (tenant-scoped, on-demand). `getConnectionsHealth`
   usecase (RLS via `runInTenantContext`) → `GET /admin/integrations/health`
   → `<ConnectionHealthPanel>` on the admin integrations page. Renders each
   enabled connection's last success, humanized freshness, and a stale badge.

**Stale threshold** = `CONNECTION_STALE_AFTER_SECONDS` = 48 h. Integration
checks are typically daily crons, so 48 h leaves a full missed cycle of slack
before a healthy daily check is flagged — avoids false positives while still
catching a genuinely-stopped collector.

**Never-succeeded connections** age from their `createdAt` (not infinity), so a
long-enabled-never-succeeded connection climbs like a dead one while a
brand-new connection isn't instantly "infinitely stale".

## Files

| File | Role |
| --- | --- |
| `src/lib/observability/connection-freshness.ts` | Cross-tenant freshness query + observable gauge registration |
| `src/app-layer/usecases/integrations.ts` | `getConnectionsHealth` (tenant-scoped health) |
| `src/app/api/t/[tenantSlug]/admin/integrations/health/route.ts` | Admin-only GET, `admin.manage` |
| `src/app/t/[tenantSlug]/(app)/admin/integrations/ConnectionHealthPanel.tsx` | Read-only per-connection health table |
| `src/app/t/[tenantSlug]/(app)/admin/integrations/page.tsx` | Mounts the panel |
| `src/instrumentation.ts` | Registers the gauge at web-tier startup |
| `messages/{en,bg}.json` | `admin.integrations.health.*` strings |

## Decisions

- **Base `prisma` for the gauge, `runInTenantContext` for the view.** The
  gauge is a platform-ops signal that must see every tenant, so it uses the
  RLS-bypassing client (the automation-runner precedent). The health API is a
  tenant surface, so it runs under RLS.
- **`PASSED` is the only "success".** `NOT_APPLICABLE` (H2 — "ran clean but no
  data") is deliberately NOT counted: a connection that only ever returns
  NOT_APPLICABLE has never actually verified anything, so it should read as
  stale.
- **Gauge and view don't share a query.** They run against different clients
  (cross-tenant vs RLS-scoped) with different shapes; a shared helper would
  have to thread the client and the tenant filter, which is more coupling than
  the ~15 duplicated lines are worth. Both use the same constant + the same
  PASSED/`_max(completedAt ?? executedAt)` semantics.
- **Web tier only.** Mirrors the existing `startIntegrationFreshnessReporting`
  wiring — the web process owns the OTel metric exporter.

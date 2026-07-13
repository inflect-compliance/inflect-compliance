# 2026-07-13 — Make every connector as complete as SharePoint

**Commit:** _(P1 of the integrations roadmap)_

## Design

Connecting a generic integration only wrote an `IntegrationConnection` row —
no sync ran, no result appeared, check outcomes were visible only via a
control's `ControlChecksTab`, and a fresh healthy connection read
"Never succeeded / Stale". SharePoint was the only connector with a run
trigger + an outcome dashboard. This brings the rest up to parity.

- **Connection-level run** — new `syncConnection(ctx, connectionId)` usecase:
  for identity providers it runs the directory sync (`runIdentitySync`), and
  for every provider it runs each control wired to that provider's automation
  keys (`automationKey startsWith 'provider.'`) via `runAutomationForControl`,
  returning a result summary. Exposed at
  `POST /admin/integrations/[connectionId]/sync`, surfaced as a **"Sync now"**
  row action, and fired once on connect so a new connection produces a visible
  first result.
- **Per-connection outcome view** — `listExecutionsForConnection` +
  `GET /admin/integrations/[connectionId]/executions` + a new outcome page
  (`[connectionId]/page.tsx`) that emulates the SharePoint health dashboard:
  per-check status (PASSED/FAILED/ERROR/…), last run, trigger, and the mapped
  control (or "Not mapped") — independent of whether a control is wired.
- **Identity roster** — `listConnectedAccounts` +
  `GET /admin/integrations/identity-accounts` + a browse page (like
  Personnel/Devices) showing source, status, admin, MFA, last synced. Linked
  from the integrations page. This is also the "check first" surface the
  CONNECTED_APP access-review launcher needed (it throws on zero subjects).
- **Health-signal fix** — `getConnectionsHealth` no longer computes freshness
  from the latest **PASSED** run only. It now also groups the latest run of
  **ANY** status and folds in a successful connection test, so freshness =
  time since last activity (run of any status OR a test-OK). A brand-new,
  tested-OK connection reads healthy, and the panel shows "Tested OK" instead
  of "Never succeeded". Last-success is still tracked separately.

## Decisions

- **`syncConnection` runs wired controls, not control-less checks.** The
  execution engine (`runAutomationForControl`) is control-anchored (evidence,
  automationKey resolution). Running a provider's checks with no control at all
  would need a synthetic-control path; deferred. The outcome view already shows
  each execution's mapped control (or "Not mapped"), and the one-click
  map-a-check-to-a-control affordance is a documented follow-up on top of this
  surface.
- **Health stays a two-signal model** (last-success + last-activity) rather
  than collapsing to one, so "when did this last PASS" and "is this connection
  live" remain distinguishable.

## Files

| File | Role |
|---|---|
| `src/app-layer/usecases/integrations.ts` | `syncConnection`, `listExecutionsForConnection`, `listConnectedAccounts`; activity-based `getConnectionsHealth` |
| `.../admin/integrations/[connectionId]/{sync,executions}/route.ts`, `.../identity-accounts/route.ts` | new routes |
| `.../admin/integrations/page.tsx` | Sync-now action, on-connect sync, outcome + identity links |
| `.../admin/integrations/[connectionId]/page.tsx` | per-connection outcome view |
| `.../admin/integrations/identity-accounts/page.tsx` | identity roster |
| `.../admin/integrations/ConnectionHealthPanel.tsx` | activity freshness + Tested-OK nuance |
| `tests/guards/p1-connector-parity.test.ts` | ratchet |

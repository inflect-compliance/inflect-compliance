# 2026-06-09 — SharePoint Graph client + connection management (SP-1)

**Commit:** `<sha>` feat(integrations): SharePoint Graph client + delegated-consent connection (SP-1)

## Why

First epic of the SharePoint roadmap. The integration framework already exists
(IntegrationRegistry + Base{Client,Mapper,SyncOrchestrator} + the GitHub
reference provider + the `IntegrationConnection/SyncMapping/Execution/WebhookEvent`
models), so SP-1 is a **provider addition**, not a framework build. It registers
SharePoint as a provider and stands up the connection lifecycle.

## Design

`providers/sharepoint/` mirrors `providers/github/`:
- **client.ts** — `SharePointClient extends BaseIntegrationClient`. SharePoint's
  verbs (listSites/listDrives/listChildren/getItem/downloadItemContent/getDelta
  + Graph subscriptions) don't fit the generic CRUD contract, so the abstract
  methods are implemented thinly (getRemoteObject→getItem, listRemoteObjects→
  listSites; create/update throw) and the real surface is the SP-specific
  methods. Stateless w.r.t. the token — the caller injects a valid access token,
  so the client stays pure + hermetically testable via the base `fetchImpl`.
- **mapper.ts** — `SharePointMapper` (DriveItem → Evidence fields).
- **token.ts** — the delegated-token lifecycle: `buildSharePointAuthorizeUrl`,
  `exchangeCodeForSharePointToken` (authorization_code grant), and
  `resolveSharePointAccessToken` (refresh-on-expiry + persist). All DI'd
  (`fetchImpl`/`env`/`now`/`refresh`/`persist`) for unit testing.
- **service.ts** — connection-management usecases (complete-connect, build-authed
  client, test, site selection, disconnect, list), admin-gated + RLS-scoped.

**OAuth — deliberate divergence from the roadmap.** Rather than overloading the
NextAuth session sign-in with `prompt=consent` (auth-critical), SP-1 uses a
**dedicated** flow: an admin-gated `connect` route returns the Entra authorize
URL + sets a 10-min HttpOnly `sp_oauth_state` cookie (`<nonce>.<tenantSlug>`);
a single tenant-agnostic callback verifies the nonce, re-authorises via
`getTenantCtx` + `assertCanAdmin` (never trusting the URL), exchanges the code,
and stores the token pair encrypted in `IntegrationConnection.secretEncrypted`.
This keeps the session token path untouched and the connection token separate
(different scopes, different lifecycle, same refresh mechanism).

## Files

| File | Role |
| --- | --- |
| `providers/sharepoint/{types,client,mapper,token,service,index}.ts` | The provider bundle. |
| `integrations/bootstrap.ts` | Registers the `sharepoint` bundle (no orchestrator yet — SP-3). |
| `api/t/[slug]/admin/integrations/sharepoint/{route,connect,sites,test}.ts` | Admin connection routes (admin.manage). |
| `api/integrations/sharepoint/callback/route.ts` | Tenant-agnostic consent callback (CSRF + re-authz). |
| `admin/integrations/SharePointCard.tsx` | Connect / test / sites / disconnect UI. |
| `docs/sharepoint.md` | Operator setup + smoke checklist. |

## Decisions

- **Separate token, dedicated callback** (above) — safer than touching sign-in.
- **`downloadItemContent` returns `ArrayBuffer`** (not a raw stream) — SP-3 wraps
  it as a `File` for `uploadEvidenceFile`; simpler + testable, fine for documents.
- **No orchestrator in SP-1** — `register()` accepts a bundle without one; the
  sync orchestrator + the scheduled-check provider land in SP-3 with the import
  pipeline.
- **Hermetic tests only** — every Graph/OAuth call is DI'd; the real round-trip
  is a documented staging smoke checklist (the EI pattern). A redacted real
  `children`/`delta` capture will anchor SP-2/SP-3 fixtures.

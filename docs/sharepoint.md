# SharePoint Integration — Operator Guide

IC sources compliance evidence from SharePoint document libraries (and, later,
syncs policies + exports audit packs). SharePoint is reached **exclusively via
Microsoft Graph**, reusing the Entra ID OAuth foundation (EI-1) — no new IdP.

## SP-1 — Connecting SharePoint (delegated consent)

SharePoint uses **delegated** Graph scopes (IC reads what the consenting admin
can read, not the whole tenant). The connection stores its **own** access +
refresh token, separate from the NextAuth session token — different scopes,
different lifecycle, same refresh mechanism (`refreshMicrosoftToken`).

### Prerequisites (one-time, in the Entra portal)
On IC's App Registration:
1. **Redirect URI** — add `{APP_URL}/api/integrations/sharepoint/callback`
   (a single, tenant-agnostic URI; the IC tenant rides in a signed cookie).
2. **API permissions** — add the **delegated** Microsoft Graph scopes
   `Sites.Read.All`, `Files.Read.All`, `Files.ReadWrite.All` (the last is for
   SP-4 policy write-back). Grant admin consent if your tenant requires it.

### Flow
1. Admin → **Integrations** → **Microsoft SharePoint** → **Connect**.
2. IC sets a 10-minute HttpOnly `sp_oauth_state` cookie (`<nonce>.<tenantSlug>`)
   and redirects to the Entra consent screen (`prompt=consent`).
3. Microsoft redirects back to the callback. IC verifies the `state` matches the
   cookie nonce, re-authorises the session as a tenant **admin**
   (`getTenantCtx` + `assertCanAdmin` — the URL is never trusted alone),
   exchanges the code for the token pair, and stores it **encrypted** in
   `IntegrationConnection.secretEncrypted`.
4. Admin picks which **sites** IC may access (**Sites**) and runs **Test**.

Access tokens are refreshed on expiry and the rotated pair is re-encrypted
transparently on the next Graph call.

## SP-4 — Policy document sync (bidirectional)

Link a policy to a SharePoint file on the policy's **Current** tab. Publishing the
policy **pushes** its content to the file; editing the file in SharePoint fires a
Graph change-notification that **pulls** a new policy version (DRAFT). A conflict
banner appears when the SharePoint copy is newer than the last sync — pull first.

> [!WARNING]
> Auto-pull needs a **publicly reachable** webhook: the Entra App Registration
> must allow `{APP_URL}/api/webhooks/sharepoint`, and in local dev `APP_URL` must
> be an `ngrok`/dev-tunnel URL. Linking + manual push/pull work without it; only
> the automatic pull-on-change requires the webhook + subscription.

Subscriptions are renewed daily by the `sharepoint-subscription-renew` cron
(Graph caps them at ~3 days). Content syncs as Markdown (DOCX is not supported).

## Smoke verification (staging — real Graph)

The SP-1 code is unit-tested hermetically (injected `fetch`); the OAuth
round-trip + real Graph shapes can only be confirmed against a real tenant:

1. **Connect** end-to-end → the connection appears with status **Connected**.
2. **Test** → returns the resolved site name (confirms `Sites.Read.All`).
3. **Sites** → lists the tenant's sites (confirms `/sites?search=*`); save a
   subset and confirm the allowed-site count updates.
4. Revoke consent in Entra, **Test** again → a clear "reconnect" error (confirms
   the 401/403 branches), and reconnect restores it.
5. Capture a redacted `GET /drives/{id}/root/children` and `/root/delta` page to
   anchor the SP-2/SP-3 fixtures (mirror `tests/fixtures/entra/`).

> [!NOTE]
> The SharePoint token is **separate** from the session JWT. Disconnecting
> removes the stored token (SP-4 also revokes Graph subscriptions); it does not
> affect the user's IC sign-in.

# 2026-06-09 — Bidirectional policy ↔ SharePoint sync (SP-4)

**Commit:** `<sha>` feat(integrations): bidirectional policy sync + Graph webhook (SP-4)

## Why

The most complex SharePoint epic: keep an IC policy and a SharePoint document in
sync both ways. Publishing an IC policy pushes content to the linked SP file;
editing the SP file fires a Graph change-notification that creates a new IC
policy version.

## Design

- **`policy-sharepoint-sync.ts`** usecase:
  - `link` — bind a policy to a DriveItem, store `sp{DriveId,ItemId,ItemETag,WebUrl}`,
    and register a Graph change subscription (`clientState = <tenantId>:<policyId>`).
  - `unlink` — delete the subscription + clear the fields.
  - `push` (IC→SP) — `uploadItemContent` the current version's text as
    `text/markdown`; store the returned eTag.
  - `pull` (SP→IC) — download the file, run it through `createPolicyVersion`
    (MARKDOWN, `changeSummary: 'Synced from SharePoint'` — which sanitises +
    reverts to DRAFT), store the eTag.
  - `conflict` / `status` — live eTag vs stored eTag.
  Content is synced as **Markdown** (no `mammoth`/DOCX dependency). Policy
  content is encrypted at rest (Epic B); the Prisma middleware decrypts on read.
- **Webhook** `/api/webhooks/sharepoint` — the Graph `validationToken` plaintext
  handshake on subscription creation; for notifications, verify `clientState`
  against the stored `policy.spSubscriptionId` (anti-spoof), persist an
  `IntegrationWebhookEvent`, and enqueue a `sharepoint-policy-pull` job. Always
  returns 200 so Graph doesn't retry on our processing errors.
- **Jobs** — `sharepoint-policy-pull` (webhook-enqueued, tenant-scoped) +
  `sharepoint-subscription-renew` (daily cron, cross-tenant fan-out renewing
  every active subscription before Graph's ~4230-min cap).
- **Publish hook** — `publishPolicy` calls `pushPolicyToSharePoint` **after** its
  transaction, best-effort (a SharePoint hiccup never fails/rolls back a publish).
- **UI** — `PolicySharePointSection` on the policy "Current" tab: link
  (single-select picker) / push / pull / unlink + a conflict warning. Renders
  nothing when SharePoint isn't configured.
- **Routes** (`policies.edit`): `…/sharepoint` (GET status, POST link, DELETE
  unlink) + `…/sharepoint/{push,pull}`.

## Decisions

- **Push hooked directly in `publishPolicy`, not via the automation bus** —
  avoids touching the automation event catalog + its contract tests; the push is
  a best-effort side-effect, not a rule-triggerable event.
- **Markdown, not DOCX** — DOCX round-tripping needs a heavy dep (`mammoth`) and
  loses fidelity; policy content is already markdown/HTML. DOCX deferred.
- **One SharePoint connection per tenant assumed** — the policy link stores no
  `connectionId`; push/pull/renew resolve the tenant's first connection. Add a
  `spConnectionId` column if multi-connection-per-tenant is ever needed.
- **`changeSummary` marks pulled versions**, not a new `PolicyVersion.source`
  enum — avoids a schema enum + its guards.

## Operator note

Graph change-notification subscriptions require a **publicly reachable**
`/api/webhooks/sharepoint`. In local dev use an `ngrok`/dev-tunnel URL as
`APP_URL` and add it to the Entra App Registration. Linking still succeeds
without a public URL (the subscription create fails soft + is logged) — manual
push/pull keep working; only the automatic pull-on-change needs the webhook.
See `docs/sharepoint.md`.

## Files

| File | Role |
| --- | --- |
| `usecases/policy-sharepoint-sync.ts` | link/unlink/push/pull/conflict/status. |
| `usecases/policy.ts` | `publishPolicy` → best-effort push. |
| `app/api/webhooks/sharepoint/route.ts` | Graph notification receiver. |
| `jobs/sharepoint-policy-jobs.ts` + registry/schedules/types | pull + renew jobs. |
| `api/t/[slug]/policies/[id]/sharepoint/{route,push,pull}.ts` | Policy SP routes. |
| `policies/[policyId]/PolicySharePointSection.tsx` | Link UI. |
| `prisma/schema/compliance.prisma` + migration | Policy `sp*` columns. |

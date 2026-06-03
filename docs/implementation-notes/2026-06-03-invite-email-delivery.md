# 2026-06-03 — Invite email delivery (and the mailer that never started)

**Commit:** `<sha> fix(invites): actually email the acceptance link + initialize the mailer`

## Symptom

An org admin used "Invite by email" but the recipient never got an email.

## Three stacked causes

1. **Invites never sent email.** `createOrgInviteToken` / `createInviteToken`
   only minted a token + relative URL; the routes returned `{ invite, url }`
   and the UI showed the admin a link to copy "into an out-of-band
   email/Slack message". The "Invite by email" button was a misnomer — no
   email was ever sent, despite the tenant usecase's own doc comment
   claiming "System emails the url to the invitee."
2. **The mailer was never initialized from env.** `initMailerFromEnv()`
   (which swaps the console sink for the real SMTP transport when
   `SMTP_HOST` is set) existed but was called *nowhere* in production
   startup — only in its own unit test. So EVERY email path (verification,
   password reset, notification outbox, digests) silently hit the console
   sink and never reached a recipient, even if SMTP were configured.
3. **No SMTP configured in prod.** `/opt/inflect/.env.prod` had empty
   `SMTP_*`. Operational — needs real provider credentials (handled
   separately, out of this PR).

## Fix (causes 1 + 2; cause 3 is env config)

- **`src/lib/email/invite-email.ts`** — `sendInviteEmail()`, composes the
  acceptance email (subject/text/html with the absolute accept URL, role,
  expiry) and sends via the shared mailer. Fail-open: the invite row is
  already committed, so a mailer outage returns `{ sent: false }` and never
  fails invite creation.
- Both invite POST routes (org + tenant) now call it after creating the
  invite, building the absolute URL with `resolvePublicOrigin(req)`, and
  return `emailSent` alongside the copy-paste `url` fallback.
- **`initMailerFromEnv()` wired into startup** — `src/instrumentation.ts`
  (web) and `scripts/worker.ts` (the worker runs the notification outbox +
  digests). No-op (console sink) when `SMTP_HOST` is unset, so dev/test are
  unchanged.

## Files

| File | Role |
| --- | --- |
| `src/lib/email/invite-email.ts` | New: fail-open invite-email sender |
| `src/app/api/org/[orgSlug]/invites/route.ts` | Send org invite email; return `emailSent` |
| `src/app/api/t/[tenantSlug]/admin/invites/route.ts` | Send tenant invite email; return `emailSent` |
| `src/instrumentation.ts` | Call `initMailerFromEnv()` (web tier) |
| `scripts/worker.ts` | Call `initMailerFromEnv()` (worker tier) |
| `tests/guards/mailer-init-wiring.test.ts` | Structural lock: both entrypoints must init the mailer |

## Decisions

- **Send inline in the route, fail-open** — mirrors `email-verification.ts`.
  Not queued through the notification outbox: that path is per-tenant-
  notification-settings gated and assumes the recipient is already a member;
  an invitee is pre-membership.
- **Email link uses `resolvePublicOrigin(req)`** — the admin creates the
  invite on the prod domain, so the request's public origin is the correct
  base (and the proxy-aware resolver avoids the internal `0.0.0.0` trap).
- **Structural guard for the init wiring** — cause #2 was a silent latent
  bug for a long time precisely because nothing asserted the call site.

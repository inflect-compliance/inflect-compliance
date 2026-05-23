# Playwright E2E suite

End-to-end tests run against a real Next.js server (booted by
`playwright.config.ts` via `next start`) and a real Postgres
(seeded fresh per spec via `tests/e2e/fixtures.ts`'s isolation
helpers).

For the structural-isolation contract — what specs may share the
seeded tenant, what must use an isolated one, the no-cross-test
`let` rule — see CLAUDE.md → "Testing Conventions → E2E tests".
This README covers a different invariant.

## Server-mode invariant: `AUTH_TEST_MODE=1`

The webServer command in `playwright.config.ts` boots the app
with:

  - `AUTH_TEST_MODE=1` — enables the test-only Credentials
    provider (`admin@acme.com` / fixture password) so specs can
    sign in without a real auth round-trip
  - `NEXT_TEST_MODE=1` / `NEXT_PUBLIC_TEST_MODE=1` — assorted
    UI-side flags
  - the deterministic `DATA_ENCRYPTION_KEY` so the run is
    reproducible

`AUTH_TEST_MODE=1` deliberately **bypasses** two server gates
the production credentials flow enforces:

  1. **Per-email rate limit** (`checkCredentialsAttempt`) — a
     login spec that fat-fingers the password 6+ times would
     lock itself out otherwise.
  2. **`AUTH_REQUIRE_EMAIL_VERIFICATION`** — Playwright fixtures
     create users that haven't clicked a verification link.

Specs that exercise the UI of these gates (banners, resend
form, rate-limit toast) still test the **rendering** of the
state; the **server enforcement** of the same gates is covered
by real-mode integration tests instead.

## Why not a sibling `playwright.real-auth.config.ts`?

A second Playwright config pointed at a no-`AUTH_TEST_MODE`
server, fed by a SMTP catcher service (mailpit / mailhog) in
`docker-compose.test.yml`, would let specs exercise the gates
through a browser. It's been considered + deferred. The
reasoning, in order of weight:

  - **The regression class is already covered by integration
    tests.** `tests/integration/credentials-end-to-end.test.ts`,
    `tests/integration/auth-ratelimit.test.ts`,
    `tests/integration/auth-gating.test.ts`,
    `tests/integration/email-verification.test.ts`, and
    `tests/integration/auth-routes.test.ts` all hit the real
    Next handlers + real Prisma with `AUTH_TEST_MODE` UNSET.
    Removing `AUTH_TEST_MODE=1` from Playwright would add a
    third layer (browser → server → DB) on top of the existing
    server → DB coverage; the marginal regression detection is
    real but small.
  - **Real infra cost.** SMTP catcher needs a Compose service,
    a wait-for-ready check, a `@real-auth` Playwright tag, and
    a second CI job. The wait-for-ready is the headache piece —
    network-dependent Compose services routinely flake the
    first 30s of a CI run.
  - **Per-spec setup cost.** A real-auth spec has to register
    a user via `/api/auth/register`, scrape the catcher mailbox
    for the verification link, click it, then proceed. That
    setup is ~20 lines per spec and ~5s per run; the existing
    fixture creates an authenticated session in zero lines and
    ~50ms.

Decision is locked in by the structural guardrail
[`tests/guards/auth-server-gate-coverage.test.ts`](../guards/auth-server-gate-coverage.test.ts).
If a future PR deletes the integration tests we're relying on,
that guard fails CI and forces a reconsideration of whether a
real-auth Playwright config now becomes worthwhile.

## When to revisit

Add a real-auth Playwright config when:

  - A bug ships that the integration tests didn't catch but a
    browser would have (e.g. a redirect chain or a cookie flag
    that only manifests in a real navigation), AND
  - Adding the same case to the existing E2E suite via UI flow
    isn't possible because `AUTH_TEST_MODE=1` short-circuits
    the gate it depends on.

A bug check is the trigger. Premise drift alone is not.

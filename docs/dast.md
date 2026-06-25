# Dynamic Application Security Testing (DAST) — OWASP ZAP

The repo's security gates were entirely **static** (CodeQL SAST, Trivy
container CVEs, npm audit, RLS, Epic A–F runtime hardening). DAST adds
the missing **dynamic** layer: it boots the real running app and probes
it over HTTP the way an attacker would.

Workflow: `.github/workflows/dast.yml` — nightly `0 4 * * *` (off-peak,
after the 03:30 load test) + `workflow_dispatch`.

## What the Baseline scan is (and isn't)

We run the **ZAP Baseline** scan, which is **passive**: ZAP spiders the
app and inspects the responses it gets, but does **not** mutate requests
or inject payloads. It catches:

- Missing/weak security headers (CSP, X-Content-Type-Options, HSTS, …)
- Cookies without `Secure` / `HttpOnly` / `SameSite`
- Cacheable sensitive content, information disclosure, verbose errors
- Mixed content, clickjacking exposure, server banner leakage

It does **not** catch active-exploitation classes — **reflected/stored
XSS, SQL injection, command injection, auth-bypass via mutated
requests**. Those need the **Full (active) scan**, ZAP's destructive
sibling, which fuzzes inputs. The Full scan is a **separate weekly
workflow** (tracked follow-up) — it's slower and needs the allowlist
curated first, so it does not ship in the first DAST PR.

### Coverage

- **Authenticated as OWNER.** A pre-scan step performs the real NextAuth
  v4 credentials login (`GET /api/auth/csrf` → `POST /api/auth/callback/credentials`
  with the `admin@acme.com` seed user) and hands ZAP the resulting
  `next-auth.session-token` cookie via its header-injection env vars
  (`ZAP_AUTH_HEADER`/`_VALUE`/`_SITE`) — `action-baseline` has no
  context/auth inputs, so header injection is the only mechanism, and a
  `.zap/zap-context.xml` is **not** used. The scan therefore covers both
  the public surface (login/register/forgot-password/health) AND gated
  `/api/t/<slug>/**` + `/t/<slug>/**` routes as a logged-in OWNER. The
  login step fails loudly if the session cookie can't authenticate
  `/api/auth/me`, so a broken login never silently degrades to an
  unauthenticated scan.
- **Multi-role matrix.** The scan runs once per seeded role
  (OWNER `admin@acme.com`, EDITOR `editor@acme.com`, READER
  `viewer@acme.com`, AUDITOR `auditor@acme.com`) — each logs in
  separately and scans that role's reachable surface, with a per-role
  SARIF category (`zap-baseline-<role>`), issue title, and artifact.
  The four jobs run in parallel (≈ single-scan wall-clock, ~4× runner
  minutes). No distinct ADMIN-role seed user exists, so OWNER covers
  the admin tier. **This is per-role PASSIVE surface coverage, NOT
  automated broken-access-control detection** — a READER session here
  scans what a READER can reach, but ZAP baseline does not assert "a
  READER must be *denied* a create route." That BAC invariant is
  enforced + tested at the app layer (`tenant-crud-authz-parity` unit
  test + `requirePermission` gates + e2e); true DAST BAC detection
  would need ZAP's Access Control add-on (Automation Framework) — a
  separate future investment.

## Reporting

- **Security tab** — the scan's JSON report is converted to SARIF
  (`.zap/zap-json-to-sarif.mjs`, dependency-free) and uploaded under
  category `zap-baseline`, alongside CodeQL + Trivy.
- **Artifact** — `report_html.html` (+ md/json) is uploaded as
  `zap-baseline-report` (14-day retention) for human triage.
- **Auto-issue** — on findings, `zaproxy/action-baseline` opens/updates
  a GitHub issue titled "ZAP Baseline Scan Findings (nightly)" (its
  built-in `allow_issue_writing`; we do not roll our own).

## Triaging a finding

1. Open the HTML artifact (or the auto-issue / Security-tab alert).
2. Identify the **URL** + the **rule code** (e.g. `10038` = CSP header).
3. Decide: **genuine** or **false-positive**?
   - **Genuine** → fix the app (add the header, set the cookie flag,
     stop caching the sensitive route, …). Re-run `workflow_dispatch`.
   - **False-positive** (framework behaviour ZAP can't see, intentional
     design) → add the rule id to `.zap/rules.tsv` as `IGNORE` **with a
     one-line `#` reason** (the `dast-workflow-pinning` guardrail
     requires the reason). Prefer `WARN` over `IGNORE` when you want it
     visible-but-non-failing.

`.zap/rules.tsv` is the single allowlist. Seeded with three well-known
Next.js false-positives (10202 anti-CSRF, 10049 cacheable `/api/health`,
10027 build-manifest comments).

### Initial findings triage (first nightly pass)

The first authenticated runs surfaced six header findings (FAIL-NEW: 0
— all WARN/INFO). Triage:

- **10037 Server Leaks Information via X-Powered-By → FIXED.**
  `poweredByHeader: false` in `next.config.js` drops the header.
- **10055 CSP wildcard, 90004 COEP missing, 10038 CSP-not-set,
  10109 Modern Web App → ACCEPTED (IGNORE, with reasons in rules.tsv).**
  These are deliberate/required design choices, not gaps:
  - `img-src`/`connect-src` use the `https:` scheme-source on purpose —
    narrowing to explicit hosts would break OAuth avatars, Sentry,
    Upstash, Stripe, OTel, HIBP, … . The load-bearing `script-src` is
    strict (nonce + strict-dynamic, no `unsafe-inline`).
  - COEP `require-corp` would **block the cross-origin OAuth-provider
    avatar images** — so COEP is intentionally omitted (COOP + CORP are
    set). Enabling it would regress the avatar feature.
  - CSP-not-set only on the static files excluded from the middleware
    matcher (robots/sitemap/favicon) — CSP is meaningless there.
- **10019 Content-Type missing → kept VISIBLE (WARN).** Low-risk
  (edge/no-body responses); not suppressed, so it re-surfaces if it ever
  appears on a content-bearing response.

The takeaway: the app's CSP is already strong; the remaining findings
are accepted trade-offs documented in `.zap/rules.tsv`, not changes to
make. (Tightening them would break functionality — the opposite of
hardening.)

## Gating posture & sunset

- **First 30 days: NON-blocking** (`fail_action: false`). Baseline scans
  produce false-positives that need allowlist tuning; a blocking gate on
  day one would just be noise.
- **On/after 2026-07-24: flip to blocking on HIGH+** (`fail_action:
  true`), mirroring the Trivy `CRITICAL,HIGH` gate. Update the
  `dast-workflow-pinning` guardrail in the same change. (Tracked task.)

## Roadmap (tracked follow-up tasks)

1. **Authenticated-OWNER baseline** — thread the NextAuth CSRF session
   (admin@acme.com) through a `.zap/zap-context.xml` so gated routes are
   covered.
2. **Multi-role scan** — OWNER/ADMIN/EDITOR/READER/AUDITOR sessions for
   broken-access-control coverage across the granular permission tiers.
3. **Weekly Full (active) scan** — separate workflow, once the allowlist
   is stable.
4. **Flip baseline to blocking** on the sunset date above.

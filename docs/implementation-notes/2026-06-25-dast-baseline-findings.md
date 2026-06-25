# 2026-06-25 — DAST (ZAP baseline) findings remediation

**Commit:** `<pending>` fix(security): remediate ZAP baseline header findings (X-Powered-By, robots/sitemap CSP) + curate allowlist

## Context

The new nightly DAST job (`.github/workflows/dast.yml`, `zaproxy/action-baseline`,
per-role matrix) opened a batch of GitHub issues (#1227–1238) for its
baseline passive findings. The scan is non-blocking during the tuning
window; the issues are the triage surface. This change dispositions
every recurring alert so future scans are clean.

## Disposition

| ZAP alert | Disposition |
|-----------|-------------|
| **10037** Server leaks `X-Powered-By` | **FIXED in #1240** (`poweredByHeader: false`) — landed independently on `main` before this PR; preserved here |
| **10038** CSP header not set on `/robots.txt`, `/sitemap.xml` | **FIXED (this PR)** — static `default-src 'none'` CSP for those two paths in `next.config.js` |
| **10055** CSP wildcard / `style-src 'unsafe-inline'` / notices | **SUPPRESSED** (accepted) |
| **90004** Cross-Origin-Embedder-Policy missing | **SUPPRESSED** (accepted) |
| **10019** Content-Type header missing | **SUPPRESSED** (benign) |
| **10109** Modern Web Application | **SUPPRESSED** (informational) |

## Why the fixes are correct/safe

- **X-Powered-By**: pure fingerprint leak; removing it has no functional
  impact.
- **robots/sitemap CSP**: those two paths are deliberately excluded from
  the middleware matcher (where the per-request nonce CSP is set), so
  they shipped no CSP. They serve no scripts/styles (and currently 404),
  so a static lock-everything-down policy is correct. Proof the header
  reaches them: ZAP already observed the *other* `next.config` headers
  (X-Frame-Options etc.) on `/robots.txt` — it only flagged CSP — so the
  `headers()` config demonstrably applies to those responses.

## Why the suppressions are legitimate (not silencing real bugs)

Each is recorded in `.zap/rules.tsv` with a written reason (enforced by
`tests/guardrails/dast-workflow-pinning.test.ts`):

- **10055** — `style-src 'unsafe-inline'` is a deliberate, documented
  decision (`src/lib/security/csp.ts`): the app emits many SSR inline
  styles, and per CSP L3 a style-src nonce would *disable* `unsafe-inline`
  for `style=""` attributes. `<style>` tags are banned by
  `tests/guards/csp-style-guardrails.test.ts`, and **script-src stays
  strict** (nonce + strict-dynamic). The `https:` scheme sources on
  img-src/connect-src are intentional (external avatars/logos, APIs).
- **90004** — COEP `require-corp` would break permitted cross-origin
  subresources (Google Fonts, external `https:` images). COOP + CORP are
  already set (`src/lib/security/headers.ts`); full cross-origin isolation
  is not a goal here.
- **10019** — Content-Type is only absent on 3xx redirect responses (no
  body) from the auth/tenant middleware; `X-Content-Type-Options: nosniff`
  is set, so there is nothing to sniff.
- **10109** — informational tech fingerprint (Next.js SPA), not a vuln.

## Follow-up

The stale per-run issues (#1227–1238) are superseded by this change and
closed referencing it; the next nightly scan should report no new alerts.

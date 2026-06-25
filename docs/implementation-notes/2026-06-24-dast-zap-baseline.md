# 2026-06-24 — Nightly DAST baseline (OWASP ZAP)

**Commit:** `<sha>` ci(security): nightly DAST baseline (ZAP) with non-blocking 30-day sunset

## Design

First **dynamic** security gate, complementing the static stack (CodeQL,
Trivy, npm audit, RLS). A nightly workflow boots the full prod-build app
+ Postgres + Redis (mirroring `load-test.yml` verbatim) and runs an
OWASP ZAP **Baseline (passive)** scan against `http://localhost:3006`.

```
docker services: postgres:16 + redis:7
  → setup-node-prisma → create RLS roles → migrate deploy + db:seed
  → npm run build (NODE_ENV=production) → npm start (bg)
  → wait /api/health
  → zaproxy/action-baseline@v0.13.0 (rules_file .zap/rules.tsv,
        fail_action: false, allow_issue_writing)
  → JSON→SARIF (.zap/zap-json-to-sarif.mjs) → upload-sarif (zap-baseline)
  → upload report_html.html artifact
```

## Files

| File | Role |
|------|------|
| `.github/workflows/dast.yml` | Nightly + dispatch workflow; boot stack mirrors load-test.yml; ZAP baseline + SARIF + HTML artifact |
| `.zap/rules.tsv` | False-positive allowlist (10202/10049/10027), each with a `#` reason |
| `.zap/zap-json-to-sarif.mjs` | Dependency-free ZAP-JSON → SARIF 2.1.0 converter (action-baseline emits no SARIF) |
| `tests/guardrails/dast-workflow-pinning.test.ts` | Ratchet: workflow exists, cron set, fail_action:false carries the sunset-date comment, rules.tsv entries all have reasons |
| `docs/dast.md` | Operator guide: what baseline catches, triage flow, sunset, roadmap |

## Decisions

- **Baseline before Full.** Passive scan (~10 min, no destructive
  mutation) ships first; the Full/active scan is a separate weekly
  workflow once the allowlist is curated — avoids a noisy, slow,
  false-positive-heavy first landing.
- **Unauthenticated first.** The prompt's auth mechanism
  (`POST /api/auth/credentials`) does not exist — real login is the
  NextAuth CSRF `callback/credentials` flow, which can't be validated
  locally and needs live-CI iteration. Shipping unauthenticated keeps
  PR #1 robust + verifiable; authenticated-OWNER + multi-role are
  tracked follow-up tasks.
- **Boot = `npm start`, not standalone.** There is no
  `output: 'standalone'` in next.config; mirrored load-test.yml's actual
  `npm start` boot instead of the prompt's `node .next/standalone/...`.
- **Own SARIF converter, not `npx zap-to-sarif`.** action-baseline emits
  no SARIF and no trustworthy converter exists on npm; a ~60-line
  dependency-free script is safer than an unaudited CI dependency. The
  SARIF upload is best-effort (`continue-on-error`) so a reporting
  hiccup never fails the non-blocking scan.
- **Non-blocking 30-day sunset → blocking on HIGH+ (2026-07-24)**,
  mirroring the Trivy gate. The guardrail asserts the sunset comment so
  the flip is a deliberate, tracked change.

# 2026-06-25 — Weekly DAST Full (active) scan

**Commit:** `<sha>` ci(security): weekly ZAP Full (active) scan

## Design

The active/destructive complement to the nightly ZAP Baseline. Where the
baseline is passive (spider + observe), `.github/workflows/dast-full.yml`
runs `zaproxy/action-full-scan` — it **injects payloads** (XSS, SQLi,
traversal, …) and **submits forms** to catch active-exploitation classes
the baseline can't.

```
WEEKLY (Sun 05:00 UTC) + dispatch
  → boot stack (mirrors dast.yml: pg16 + redis, seed, npm start, /api/health)
  → OWNER login (NextAuth CSRF → session cookie → ZAP_AUTH_HEADER*)
  → action-full-scan@v0.13.0 (rules .zap/rules.tsv, non-blocking)
  → JSON→SARIF (.zap/zap-json-to-sarif.mjs) → upload-sarif (category zap-full)
  → HTML artifact + weekly auto-issue
```

## Decisions

- **Why safe despite "this action performs attacks":** it targets only
  the EPHEMERAL CI app — a fresh Postgres seeded per run, no real data,
  no SMTP (form-submit "messages" no-op), rate-limiting off. Throwaway
  state, discarded at job end. The workflow header forbids ever pointing
  `target` at a shared/real env.
- **Weekly, not nightly** — an active scan is ~30-60 min (spider + attack
  every input) vs the ~10 min baseline; `timeout-minutes: 60`.
- **OWNER single job, not a 4-role matrix** — a 4× hour-long active scan
  is excessive; OWNER reaches the most surface. Multi-role active scan is
  a future follow-up if warranted.
- **Non-blocking roll-in** (`continue-on-error` + `fail_action: false`),
  same posture + rationale as the baseline. Own SARIF category `zap-full`
  so its analysis is distinct from `zap-baseline-*` in the Security tab.
- **Shares `.zap/rules.tsv`** — the curated baseline allowlist (the
  accepted header trade-offs) applies here too, so the active findings
  that stand out are the genuinely new active-class ones.
- **Same dependency-free SARIF converter** as the baseline; reused, not
  duplicated.

## Files
| File | Role |
|------|------|
| `.github/workflows/dast-full.yml` | the weekly active-scan workflow |
| `tests/guardrails/dast-workflow-pinning.test.ts` | extended: a `DAST Full-scan workflow pinning` block (weekly cron, full-scan action, OWNER auth, non-blocking, `zap-full` category, shared allowlist) |
| `docs/dast.md` | Baseline-vs-Full section + roadmap updated |

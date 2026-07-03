# 2026-07-03 — AI injection + egress guard

**Commit:** `<pending> feat(ai): content-aware injection + egress guard`

## Design

A TypeScript-native, pattern+normalization guard for the AI layer covering
BOTH directions, composed with (never replacing) the existing privacy
sanitizer (PII) and the prompt-builder trust fence (delimiting +
`neutralizeUntrustedText`).

```
untrusted tenant content ──▶ privacy-sanitizer (PII) ──▶ guardUntrustedInput ──▶ prompt fence ──▶ provider
                                                              │ scan (normalize→match)
model / agent output ──▶ output-guard ──▶ guardEgress ──▶ persist / commit
                                              │ secret/exfil scan
```

Module: `src/app-layer/ai/guard/`
- `normalize.ts` — 6-pass deterministic fold: NFKC + homoglyph, base64
  decode, hex decode, zero-width/bidi strip, whitespace collapse, case fold.
  Defeats base64 / homoglyph / zero-width evasion before matching.
- `patterns.ts` — rule table. Injection: ignore-previous, system-role-
  injection, instruction-override, tool-poisoning, exfil-directive. Egress/
  DLP: API keys, bearer/JWT, private-key PEM, seed phrases, generic high-
  entropy. Each rule has a stable `id` + severity; taxonomy adapted from
  pipelock (Apache-2.0, see `NOTICE`).
- `injection-scanner.ts` / `egress-scanner.ts` — normalize THEN match;
  return `{ verdict, ruleIds }` — never the raw matched text.
- `policy.ts` — per-tenant mode (`strict|balanced|audit`, default balanced)
  + the enforcement contract (`resolveEnforcement(mode, verdict, direction)`).
- `index.ts` — barrel + `guardUntrustedInput` / `guardEgress` compose helpers
  (scan → resolve mode → audit non-clean → return outcome) + `assertGuardAllowed`.

## Enforcement contract

| mode     | input malicious | input suspicious | egress secret | egress suspicious |
|----------|-----------------|------------------|---------------|-------------------|
| strict   | BLOCK           | FLAG             | BLOCK         | FLAG              |
| balanced | FLAG            | FLAG             | BLOCK         | FLAG              |
| audit    | ALLOW (log)     | ALLOW (log)      | ALLOW (log)   | ALLOW (log)       |

A leaked secret in OUTBOUND content is blocked under strict AND balanced —
secrets never leave the boundary or get committed. `audit` is the only
escape hatch (deliberate per-tenant triage opt-in).

## Files

| File | Role |
|------|------|
| `src/app-layer/ai/guard/normalize.ts` | 6-pass deobfuscation fold |
| `src/app-layer/ai/guard/patterns.ts` | injection + egress rule table (pipelock taxonomy) |
| `src/app-layer/ai/guard/injection-scanner.ts` | `scanInjection` |
| `src/app-layer/ai/guard/egress-scanner.ts` | `scanEgress` |
| `src/app-layer/ai/guard/policy.ts` | mode resolution + enforcement contract |
| `src/app-layer/ai/guard/index.ts` | barrel + `guardUntrustedInput`/`guardEgress`/`assertGuardAllowed` |
| `src/app-layer/usecases/risk-suggestions.ts` | input+egress guard around the provider call |
| `src/app-layer/usecases/vendor-doc-extraction.ts` | input+egress guard around doc extraction |
| `src/app-layer/usecases/agent-proposals.ts` | guard at propose + the commit (approve) gate |
| `prisma/schema/enums.prisma` | `AiGuardMode` enum |
| `prisma/schema/auth.prisma` | `TenantSecuritySettings.aiGuardMode` column |
| `prisma/migrations/20260703170000_ai_guard_mode/migration.sql` | enum + column (additive, defaulted) |
| `tests/guards/ai-guard-coverage.test.ts` | coverage/evasion/egress/invariant/log-hygiene ratchet |
| `NOTICE` | pipelock (Apache-2.0) taxonomy attribution |

## Decisions

- **Per-tenant mode reuses `TenantSecuritySettings`** — the existing per-tenant
  security row. The new column is covered by that table's existing RLS row
  policies (RLS is row-level, not column-level), so no RLS migration was
  needed. Default `BALANCED`, additive + NOT NULL DEFAULT — safe on existing
  rows.
- **Compose, don't replace.** The guard runs ALONGSIDE the privacy sanitizer
  and the prompt-builder fence. `sanitize → guard` order on egress so PII scrub
  happens first, then the secret/exfil scan. The prompt-builder's
  `neutralizeUntrustedText` + `[UNTRUSTED DATA]` markers stay regardless of
  verdict (defence in depth).
- **Auto-commit-block invariant.** All three AI paths are propose-not-commit;
  the guard blocks the model call (strict + malicious input, or a secret-leak
  egress hit) before generation, and re-scans at the single human commit gate
  (`approveAgentProposal`) so a poisoned/secret-bearing payload can never
  become a live compliance record.
- **Rule ids only in the audit.** Non-clean verdicts write a hash-chained
  `AiGuard` AuditLog entry (`category: 'access'`) carrying rule ids + verdict +
  enforcement + mode — never the raw injected text or secret material. Both the
  scanners and the audit path are structurally prevented from carrying content.
- **compliance-posture is exempt** — it sends only aggregate counts to the
  model, no tenant free text, so there is no injection surface (recorded in the
  ratchet's `AI_GUARD_EXEMPT`).
- **No ML** — pure pattern + normalization, deterministic, exhaustively unit-
  testable, cheap enough to run locally on every path (no double-charge with
  the rate-limiter).

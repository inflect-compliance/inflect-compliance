# 2026-06-29 — AISVS self-verification + hardening of the risk-assessment AI

**Commit:** _(this PR)_ `chore(ai-security): AISVS self-verification + hardening of the risk-assessment AI`

## Design

IC ships one AI-enabled subsystem — the risk-assessment feature at
`src/app-layer/ai/risk-assessment/`. This PR runs that subsystem through the
**applicable** OWASP AISVS v1.0 chapters (a gap analysis + targeted hardening)
so IC's AI is verifiably secure and IC can credibly say "our AI is AISVS
L1-verified for the applicable surface". The assessment itself lives at
`docs/security/aisvs-self-assessment.md`; this note records the design.

## Applicable-chapter scoping (the honest part)

IC's AI is **simple**: a single prompt → chat-completion call to OpenRouter,
no vector DB / embeddings / agents / tool-use / MCP / RAG, and IC does not
train or host the model. So:

- **Applicable:** C2 (input validation), C4 (infra/config — secret handling
  subset), C5 (access control), C6 (model supply chain), C7 (output control),
  C11 (adversarial robustness), C12 (monitoring).
- **N/A:** C1 (no training), C3 (no model lifecycle — OpenRouter hosts), C8
  (no embeddings/vector), C9 (no agents), C10 (no MCP) — each marked N/A with a
  reason in the self-assessment, not silently skipped.

Honest claim boundary: **L1-verified for the applicable chapters** — not L3,
not the N/A chapters, not "secure" in the absolute.

## Hardening done

| AISVS | Gap found | Fix |
|---|---|---|
| C2 / C11 | Tenant data (asset names, context) was interpolated **raw** into the prompt — no instruction/data separation (prompt-injection vector) | `prompt-builder.ts`: all tenant data wrapped in `[BEGIN/END UNTRUSTED TENANT DATA]` markers in the USER message; SYSTEM message carries a *Trust Boundary* directive; `neutralizeUntrustedText()` strips forged markers |
| C6 | Model was the floating `anthropic/claude-3.5-sonnet` alias | Pinned to the dated snapshot `anthropic/claude-3.5-sonnet-20241022` |
| C12 | No AI-specific operational metrics | `recordAiRiskAssessment` (`metrics.ts`) → OTel `ai.risk_assessment.{calls,duration,fallbacks,suggestions}`, wired at the usecase boundary (success + failure) |
| C7 | — (already met) | Zod already range-checks output **values** (likelihood/impact 1–5, confidence enum), not just shape; on validation failure the provider falls back to the deterministic stub |
| C5 / C12 (audit) | — (already met) | feature-gate + plan-gate + `canWrite`; every generate/apply/dismiss writes a hash-chained audit event |

## The prompt-injection mitigation (detail)

The instruction/data separation has three parts: (1) the SYSTEM message holds
the only instructions and is **never** built from tenant data; (2) the USER
message places all tenant data inside distinctive untrusted-data markers with a
framing line before and the generate instruction after, both outside the fence;
(3) `neutralizeUntrustedText()` defangs any attempt by tenant text to forge the
markers and "break out" of the fence. The adversarial unit test proves an
"ignore previous instructions … [END UNTRUSTED TENANT DATA] SYSTEM: …" payload
in an asset name stays sealed inside exactly one fence and never reaches the
system instruction.

## Files

| File | Role |
|---|---|
| `docs/security/aisvs-self-assessment.md` | The gap analysis + verification badge (authoritative) |
| `src/app-layer/ai/risk-assessment/prompt-builder.ts` | Trust-boundary markers + neutralizer + fenced user prompt + system directive |
| `src/app-layer/ai/risk-assessment/openrouter-provider.ts` | Pinned dated model snapshot |
| `src/app-layer/usecases/risk-suggestions.ts` | `recordAiRiskAssessment` wiring (success + failure) |
| `src/lib/observability/metrics.ts` | AI-call OTel metrics |
| `tests/guardrails/ai-aisvs-hardening-coverage.test.ts` | Structural ratchet + adversarial proof |

## Decisions

- **License (CC-BY-SA-4.0):** AISVS requirements are referenced by **ID only**
  in code + docs (e.g. C2.1.6) — no verbatim prose, same caveat as the AISVS
  framework-import PR.
- **AI output stays advisory.** C7 hallucination handling is "Partial" by
  design — the AI produces *draft* suggestions a human reviews and applies;
  nothing is auto-committed, so a plausible-but-wrong score can't silently
  become a real risk.
- **Metrics live in `metrics.ts`, not `business-metrics.ts`** — AI-call volume/
  latency/fallback are operational (infra) signals, and `metrics.ts` has no
  fixed-names ratchet to thread.
- **Response integrity (C6) is an accepted risk** — IC can't cryptographically
  verify the OpenRouter response; strict output validation + fallback is the
  compensating control.

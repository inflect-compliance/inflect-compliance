# 2026-07-01 — Local/self-hosted LLM provider (AI sovereignty) + prompt hygiene

**Commit:** `<pending>` feat(ai): local provider + aiResidency LOCAL_ONLY invariant + prompt-hygiene guard

## Context

IC's AI risk-assessment layer had a provider interface with OpenRouter + stub
providers, a privacy-sanitizer, rate-limiter, and feature-gate — but **every
path called an external provider**. A sovereignty-conscious tenant could not
keep inference in-jurisdiction. This adds a local/self-hosted provider + a
per-tenant residency invariant, and a lightweight prompt-template hygiene
ratchet. Authored from IC's own patterns — no third-party (AGPL) code.

## Part A — Local provider + `aiResidency` (the real value)

- `LocalRiskSuggestionProvider` (`src/app-layer/ai/risk-assessment/local-provider.ts`)
  implements the existing `RiskSuggestionProvider` interface, calling an
  **OpenAI-compatible** chat-completions endpoint (Ollama / vLLM / any local
  gateway). Config: base URL + model (`AI_LOCAL_*` env, with an optional
  per-tenant override). Same fall-back-to-stub-on-error contract as the
  OpenRouter provider. IC does **not** bundle or host a model — ops owns the
  gateway + runtime.
- `TenantSecuritySettings.aiResidency` (`AiResidency` enum `EXTERNAL | LOCAL_ONLY`,
  default `EXTERNAL`) sits beside the existing `aiGuardMode`. `aiLocalBaseUrl` /
  `aiLocalModel` are the optional per-tenant overrides.
- **The LOCAL_ONLY invariant is HARD, not a preference.** In `getProvider`, a
  `LOCAL_ONLY` selection returns a local provider (or the deterministic stub if
  no gateway is configured) **before any OpenRouter construction** — even when
  `AI_RISK_PROVIDER=openrouter` with a key present, a LOCAL_ONLY tenant's
  inference never reaches an external provider. The usecase resolves residency
  from `TenantSecuritySettings` and threads it into the factory.
- Reuse: privacy-sanitizer, rate-limiter, feature-gate, and the AiDecisionLog
  from #1439 — a local inference records `provider=local` (the Art 12 trail).
- Pairs with the SSRF egress allowlist (#1436): a LOCAL_ONLY tenant's AI calls
  stay on an allowlisted internal host.

## Part B — Prompt-template hygiene guard (deliberately lightweight)

`tests/guards/prompt-template-hygiene.test.ts` is a structural ratchet over IC's
OWN prompt-builders — NOT a new CI system. It asserts:
1. **Delimiting** — the risk-assessment builder fences untrusted tenant free-text
   (`UNTRUSTED_DATA_OPEN`/`CLOSE`) and neutralises forged markers
   (`neutralizeUntrustedText`); vendor-doc consumes pre-sanitised text.
2. **No secrets** — no `.secret-patterns` match in any prompt-builder.
3. **Role separation** — builders return distinct `system` / `user` roles, and
   tenant free-text is applied only after the system instructions are fixed
   (never interpolated into the system role).

## Files

| File | Role |
| --- | --- |
| `src/app-layer/ai/risk-assessment/local-provider.ts` | OpenAI-compatible local provider |
| `src/app-layer/ai/risk-assessment/index.ts` | factory + `LOCAL_ONLY` hard invariant |
| `prisma/schema/{enums,auth}.prisma` | `AiResidency` enum + `aiResidency`/`aiLocal*` on TenantSecuritySettings |
| `prisma/migrations/20260704090000_ai_residency/` | additive enum + columns |
| `src/env.ts` | `AI_LOCAL_BASE_URL` / `AI_LOCAL_MODEL` / `AI_LOCAL_API_KEY` |
| `src/app-layer/usecases/risk-suggestions.ts` | resolve residency → getProvider |
| `tests/guards/ai-residency-enforcement.test.ts` | LOCAL_ONLY invariant ratchet |
| `tests/guards/prompt-template-hygiene.test.ts` | prompt hygiene ratchet |

## Decisions

- **Hard refusal over preference.** LOCAL_ONLY short-circuits the factory before
  the OpenRouter branch is reachable — a residency invariant a config change
  can't accidentally defeat. A source-order ratchet locks the short-circuit.
- **No model bundling.** IC calls a tenant-provided gateway; the model runtime
  is ops-owned. Falls back to the deterministic stub (never external) when the
  gateway is unset or errors.
- **A guard test, not a scanner.** Prompt hygiene is a cheap structural ratchet
  in the existing `tests/guards/` style — no external tooling, no runtime cost.

## Not doing

- Bundling/hosting a model.
- A heavyweight prompt-scanning CI pipeline.
- Any AegisAI code/model (AGPL).

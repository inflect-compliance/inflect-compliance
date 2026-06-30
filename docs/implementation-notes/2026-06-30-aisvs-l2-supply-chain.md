# 2026-06-30 — AISVS L2: supply-chain integrity + config audit + badge flip

**Commit:** `<sha> feat(ai): AISVS L2 supply-chain integrity + config audit + flip badge to L2-verified`

## Context

**PR 4 of 4 — the finale** of the AISVS v1.0 L1→L2 uplift of IC's risk-assessment
AI. With this, every **applicable** L2 requirement is met and the verification
badge flips to **"AISVS v1.0 L2-verified for the applicable chapters"**.

The four PRs:
1. `#1354` — output safety gate (C7.2.2 / C7.3.2 / C7.3.3 / C5.2.4)
2. `#1358` — input anomaly detection + reserved-token neutralization (C2.1.7 / C11.4 / C12.2.2-4)
3. `#1360` — structured inference log + per-tenant token attribution (C12.1 / C12.2.5)
4. this PR — supply-chain integrity + config audit + allow-list (C6.1.3/.1.4 / C12.4 / C5.2.1 L2)

## What this closes

| AISVS | Requirement | Now |
|---|---|---|
| C6.1.3 | third-party artifact integrity-verifiable | provider reads the response `model` field, compares to the requested/pinned model; mismatch → warn + `modelMismatch` on the inference log (silent-swap detection) |
| C6.1.4 | behaviourally test models before non-dev deploy | a deterministic golden-prompt eval (stub provider, fixed input, shape + bounds asserted) — a regression guard on the prompt+schema contract |
| C12.4.3 / C12.5.3 | log config/override changes | a non-default model (`OPENROUTER_MODEL` override of the pinned `DEFAULT_MODEL`) is logged once at provider construction |
| C5.2.1 (L2) | default-deny allow-list | `feature-gate.ts` encodes an explicit `AI_ACCESS_ALLOWLIST` — denied by default, granted only when every predicate passes; no implicit-allow path |

## Design

- **Model-id check, not a signed channel.** IC can't sign a hosted model, so
  C6.1.3 is satisfied by detecting a *swap*: OpenRouter echoes the model that
  served the request; differ-from-requested → flag. Cheap, real signal.
- **Golden eval against the stub.** Deterministic + offline — it locks the
  output *contract* (shape + value bounds), the part IC controls, without a
  network dependency or a live-model assertion that would be flaky.
- **Allow-list as a predicate list.** The gate was already a conjunction of
  checks; PR 4 makes the default-deny posture *explicit* and structural (an
  array of predicates, deny-on-first-fail, allow only at the end) so the
  property is legible + ratchet-lockable.

## Files

| File | Role |
|---|---|
| `src/app-layer/ai/risk-assessment/openrouter-provider.ts` | Exports `DEFAULT_MODEL`; reads response `model`, computes `modelMismatch`; logs override at construction. |
| `src/app-layer/ai/risk-assessment/types.ts` | `RiskSuggestionOutput.actualModel` + `.modelMismatch`. |
| `src/app-layer/ai/risk-assessment/inference-log.ts` | `modelMismatch` on the structured log. |
| `src/app-layer/ai/risk-assessment/feature-gate.ts` | Explicit `AI_ACCESS_ALLOWLIST` default-deny gate. |
| `src/app-layer/usecases/risk-suggestions.ts` | Threads `modelMismatch` into the inference log. |
| `tests/unit/ai-golden-prompt-eval.test.ts` | C6.1.4 golden eval + C5.2.1 allow-list proof. |
| `tests/guardrails/ai-aisvs-hardening-coverage.test.ts` | C6.1.3/.1.4 + C5.2.1 locks; **badge assertion flipped L1 → L2**. |
| `docs/security/aisvs-self-assessment.md` | Badge → L2; C5.2.1 / C6 / C12.4 rows updated. |

## Decisions

- **Badge flip is gated by the ratchet.** The hardening ratchet's badge
  assertion now requires `/L2-verified for the applicable chapters/` (still
  forbids any L3 claim) — so the doc and the code can't drift apart, and a
  future regression that weakens an L2 control will fail CI alongside a stale
  badge.
- **Still a self-assessment, still scoped.** L2 for the seven applicable
  chapters only; C1/C3/C8/C9/C10 remain N/A; this is not third-party
  certification.

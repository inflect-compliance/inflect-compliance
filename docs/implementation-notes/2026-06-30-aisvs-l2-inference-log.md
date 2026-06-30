# 2026-06-30 — AISVS L2: structured inference log + token attribution

**Commit:** `<sha> feat(ai): AISVS L2 structured inference log + per-tenant token attribution`

## Context

**PR 3 of 4** in the AISVS v1.0 L1→L2 uplift of IC's risk-assessment AI
(PR 1 = output gate, PR 2 = input anomaly detection). Closes the
observability-side L2 gaps. The badge flips to "L2-verified" in PR 4.

## What this closes

| AISVS | Requirement | Before | After |
|---|---|---|---|
| C12.1.3 | structured schema for inference logs | scattered ad-hoc audit metadata | one versioned `ai.inference.v1` record per call (`buildInferenceLog`) on the audit event |
| C12.1.2 | log safety-filtering / policy decisions | counts buried in metadata | a `safetyDecisions` block (redactions, low-conf drops, input anomalies, review flag, fallback) inside the inference log |
| C12.2.5 | track token usage at granular attribution | no token capture at all | provider captures the response `usage`; per-tenant granular via the audit inference log + an aggregate `ai.risk_assessment.tokens` OTel counter |

## Design

- **Token capture.** `openrouter-provider.ts` now types + reads the response
  `usage` object (OpenAI/OpenRouter `prompt_tokens` / `completion_tokens` /
  `total_tokens`), mapped to a camelCase `TokenUsage` on `RiskSuggestionOutput`.
  The deterministic stub reports none → `usage` is `undefined` → token fields
  are `null` downstream (handled, never `NaN`).
- **Structured log.** `inference-log.ts::buildInferenceLog` is a pure function
  producing the typed `AiInferenceLog` (`schema: 'ai.inference.v1'`). The
  usecase builds one on BOTH the success and failure paths and attaches it to
  the generation audit event's `detailsJson` (which is `.passthrough()`, so the
  nested object persists). A SIEM can parse every AI call uniformly.
- **Token metric — low cardinality, by design.** `ai.risk_assessment.tokens`
  is labelled `provider` + `kind` (prompt/completion) only. Per-tenant
  attribution lives in the **audit trail** (which already carries tenant +
  actor), NOT as a metric label — embedding tenant ids in OTel attributes would
  explode cardinality. So C12.2.5's "granular attribution" is satisfied by the
  audit inference log; the metric is the aggregate capacity signal.

## Files

| File | Role |
|---|---|
| `src/app-layer/ai/risk-assessment/types.ts` | `TokenUsage` + `RiskSuggestionOutput.usage?`. |
| `src/app-layer/ai/risk-assessment/openrouter-provider.ts` | Captures the response `usage`. |
| `src/app-layer/ai/risk-assessment/inference-log.ts` | `buildInferenceLog` — the structured `ai.inference.v1` record. |
| `src/lib/observability/metrics.ts` | `ai.risk_assessment.tokens` counter; token args on `recordAiRiskAssessment`. |
| `src/app-layer/usecases/risk-suggestions.ts` | Builds the inference log (success + failure); threads tokens to the metric. |
| `tests/unit/ai-inference-log.test.ts` | Behavioral proof of the schema + token capture + safety block. |
| `tests/guardrails/ai-aisvs-hardening-coverage.test.ts` | Extended with the C12 L2 lock. |
| `docs/security/aisvs-self-assessment.md` | C12 rows updated (badge unchanged until PR 4). |

## Decisions

- **Per-tenant attribution via audit, not metric label.** The cleanest read of
  C12.2.5 that doesn't wreck OTel cardinality — the audit event is already the
  granular, per-tenant, queryable record.
- **Inference log on failure too.** A failed inference is as parseable as a
  successful one (`outcome: 'failure'`, zero tokens, `fallback: true`) — so a
  SIEM rule keys on `schema` uniformly.
- **`detailsJson` passthrough.** The audit details schema is `.passthrough()`,
  so the nested `inferenceLog` persists without widening the typed schema (same
  mechanism PR 2's `anomalies` array already used).

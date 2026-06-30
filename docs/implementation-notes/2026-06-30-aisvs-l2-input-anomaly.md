# 2026-06-30 — AISVS L2: input anomaly detection + reserved-token neutralization

**Commit:** `<sha> feat(ai): AISVS L2 input anomaly detection + reserved-token neutralization`

## Context

**PR 2 of 4** in the AISVS v1.0 L1→L2 uplift of IC's risk-assessment AI
(PR 1 = output safety gate). Closes the input-side L2 gaps. Badge flips to
"L2-verified" only in PR 4.

## What this closes

| AISVS | Requirement | Before | After |
|---|---|---|---|
| C2.1.7 | encode reserved tokens as literal chars | `neutralizeUntrustedText` stripped only forged trust-boundary markers | also strips ChatML `<\|…\|>`, Llama `[INST]`/`<<SYS>>`/`<s>`, and `Human:`/`Assistant:`/`System:` turn markers |
| C11.4.1 | pass untrusted inputs through anomaly detection | none | `detectInputAnomalies` screens every tenant field |
| C11.4.2 | gate actions on flagged anomalies | none | flagged generation returns `reviewRecommended: true` (human is the gate; output is advisory) |
| C12.2.2 / .2.3 / .2.4 | identify probing patterns; AI-specific rules; offending metadata | none | dedicated `AI_RISK_INPUT_ANOMALY` audit event with field + kind + snippet |

## Design

`input-anomaly.ts::detectInputAnomalies(input)` is a **pure** function run in
the usecase right after `sanitizeProviderInput` (so it screens exactly what
will be prompted, and the upstream PII-strip already ran). It scans every
tenant-controlled field (`tenantIndustry`, `tenantContext`, `frameworks[]`,
`assets[].name`, `existingControls[]`) for four signal kinds —
`injection_phrase`, `reserved_token`, `role_override`, `excessive_specials` —
returning `{ anomalies: [{ field, kind, snippet }], flagged }`.

It is **non-blocking** by design: the C2 instruction/data trust boundary +
the C2.1.7 token neutralizer already *contain* the attack, so screening adds
**monitoring + human-review signal**, not a hard block (a false positive must
not deny a legitimate assessment). On a flag the usecase:

1. emits `AI_RISK_INPUT_ANOMALY` (structured `detailsJson` — field/kind/snippet,
   no raw payload to the SIEM), separate from the generation event;
2. returns `reviewRecommended: true` (also on the generation audit row) so the
   draft is surfaced "review carefully" — the human applying the suggestion is
   the action gate (C11.4.2), consistent with the advisory-output model.

## Files

| File | Role |
|---|---|
| `src/app-layer/ai/risk-assessment/prompt-builder.ts` | `neutralizeUntrustedText` extended with `RESERVED_TOKEN_PATTERNS` (C2.1.7). |
| `src/app-layer/ai/risk-assessment/input-anomaly.ts` | Pure `detectInputAnomalies` detector. |
| `src/app-layer/usecases/risk-suggestions.ts` | Screens input; emits `AI_RISK_INPUT_ANOMALY`; returns `reviewRecommended`. |
| `tests/unit/ai-input-anomaly.test.ts` | Behavioral proof (neutralizer + detector). |
| `tests/guardrails/ai-aisvs-hardening-coverage.test.ts` | Extended with the L2 input-screen lock. |
| `docs/security/aisvs-self-assessment.md` | C2/C11/C12 rows updated (badge unchanged until PR 4). |

## Decisions

- **Detect, don't block.** Containment is the trust boundary + token
  neutralizer; the screen is a monitoring/forensics + human-review layer. A
  hard block on a heuristic would deny legitimate assessments on false
  positives.
- **Snippet capped at 40 chars, structured-only.** Enough for forensics
  (C12.2.4) without shipping the raw tenant payload as free text to the SIEM —
  respects the Epic C.4 audit-stream privacy rule.
- **Review flag, not a schema column.** `reviewRecommended` rides the API
  response + audit row; no migration. The durable record is the audit event.

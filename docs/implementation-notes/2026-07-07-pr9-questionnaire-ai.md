# 2026-07-07 — PR-9: Inbound security questionnaire automation (AI)

**Commit:** _(pending)_ `feat(questionnaire): AI autofill grounded in controls/policies/evidence + answer library`

## Design

A prospect/customer sends a security questionnaire; the tenant uploads it, the
AI drafts **cited** answers grounded in the tenant's own approved compliance
content, low-confidence items are flagged for a human, and accepted answers
feed a reusable answer library.

```
upload → InboundQuestionnaire + items (PENDING)
autofill (governed): enforceFeatureGate → checkRateLimit → runInTenantContext
  → gather grounding (Control/Policy/Evidence) → per item:
      library match (≥0.6 overlap)  OR  provider.draftAnswer(grounding)
      → confidence ≥ 0.4 ? DRAFTED : FLAGGED   (never auto-answers a low-confidence item)
      → logEvent per answer
  → recordGeneration
accept → answer library (feedback loop)
```

- **AI module** `src/app-layer/ai/questionnaire/` (sibling of `ai/risk-assessment`):
  `types` (provider interface + shared keyword-overlap `relevance`),
  `stub-provider` (deterministic, grounded, cited — the zero-config fallback;
  drafts ONLY from the ranked grounding, low confidence on no-match),
  `openrouter-provider` (real LLM, prompt = answer-only-from-grounding + cite
  the snippet ids; throws → stub fallback), `index` (env-gated factory,
  `AI_QUESTIONNAIRE_PROVIDER` default `stub`).
- **Usecase** reuses the risk-assessment `enforceFeatureGate` / `checkRateLimit`
  / `recordGeneration` (generic, ctx-based) so the governed-AI ordering matches
  the only prior precedent.
- **Models** (RLS): `QuestionnaireAnswerLibrary`, `InboundQuestionnaire`,
  `InboundQuestionnaireItem` (draft + confidence + sourceCitation + status).

## Residency / injection (new scope)

The only prior governed-AI feature (risk suggestions) has no residency /
prompt-injection primitive, and neither does this. Mitigations in place:
questionnaire text is **sanitised on write** + **truncated** before the
provider; the prompt instructs **answer-only-from-grounding**; low confidence →
FLAGGED (a human reviews before anything is sent back). A dedicated per-tenant
residency + prompt-injection guard for this surface is a documented follow-up.

## Scope

Review/edit/export **UI deferred** (API-complete: upload, autofill, list items,
accept). CSV/Excel/doc parsing is client-side (the API takes `questions[]`);
coverage-insights + export-to-original-format are follow-ups.

## Decisions

- **Library-first, then AI.** A previously-accepted answer (≥0.6 question
  overlap) is reused with high confidence before spending an AI call — cheaper,
  more consistent, and improves with every acceptance.
- **Cited-or-flagged, never guessed.** Confidence < 0.4 → FLAGGED; the stub
  returns 0.1 on no grounding match, so an unsupported question is never
  auto-answered.

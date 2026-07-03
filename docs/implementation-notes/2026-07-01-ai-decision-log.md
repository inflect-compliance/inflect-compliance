# 2026-07-01 — AI decision log + feedback/quality observability

**Commit:** `<pending>` feat(ai): AI decision log (Art 12) + human-oversight feedback + OTel

## Context

IC's AI risk-assessment feature had a provider abstraction, rate-limiter, and
privacy-sanitizer — but **no record** of what the AI suggested, whether a human
accepted it, or its latency/cost/quality. That is both an AI-ops blind spot and
a missing **EU AI Act Article 12** (record-keeping for high-risk AI) / ISO 42001
control. This adds a decision log + a human-oversight feedback loop, reusing IC's
Epic E observability + append-only audit DNA. Authored from the Regulation + IC's
own patterns — nothing from any third-party (AGPL) source.

## Design

### Decision log

`AiDecisionLog` (`prisma/schema/automation.prisma`) — one tenant-scoped row per
AI-feature invocation. **Privacy is structural:** it stores a SHA-256
`inputDigest` of the *sanitised* provider input (never the raw prompt or any
PII), plus a bounded, sanitised `outputSummary`, `latencyMs`, `tokensIn/Out`,
the output-guard `guardVerdict`, and the `humanOutcome`. The writer is
`logAiDecision` in `src/app-layer/ai/decision-log/`.

**Append-only.** The core record is a compliance artifact, so a DB trigger
(`ai_decision_log_immutable`) blocks any UPDATE that changes a core column. The
**only** permitted mutation is a one-way `humanOutcome` stamp (`PENDING` →
terminal). This satisfies "rows linked to a high-risk AiSystem are append-only"
for *every* row, not just high-risk ones.

### Feedback loop (Art 14 human oversight)

`recordDecisionOutcome` transitions `humanOutcome` PENDING → terminal, keyed by
the generating session. Wired into the existing apply/dismiss flow:
`applySession` → `ACCEPTED` (or `REJECTED` if nothing was applied),
`dismissSession` → `REJECTED`. This is both the quality signal (acceptance rate
per model) and the human-oversight evidence.

### Observability (Epic E)

Reuses `src/lib/observability/metrics.ts`: `recordAiDecisionLogged`
(`ai.decision.logged` + `ai.decision.guard_blocks`) per invocation, and
`recordAiDecisionOutcome` (`ai.decision.outcome`) per human decision — so
acceptance rate + guard-block rate are alertable. Latency + token metrics were
already emitted by `recordAiRiskAssessment`. Cardinality rule respected:
`tenant.id` is never a label.

### Coverage

The provider call path is single (only `risk-suggestions.ts` imports
`getProvider` from `@/app-layer/ai/risk-assessment`); `logAiDecision` is called
on both the success and failure branches, and the ratchet fails CI if a new AI
call site imports the provider factory without logging.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/automation.prisma` | `AiDecisionLog` model + `AiHumanOutcome` enum |
| `prisma/migrations/20260703130000_ai_decision_log/` | table + RLS trio + append-only trigger |
| `src/app-layer/ai/decision-log/index.ts` | `logAiDecision` + `recordDecisionOutcome` + digest/summary |
| `src/lib/observability/metrics.ts` | `recordAiDecisionLogged` / `recordAiDecisionOutcome` |
| `src/app-layer/usecases/risk-suggestions.ts` | log on invocation; stamp outcome on apply/dismiss |
| `tests/guards/ai-decision-log.test.ts` | coverage / privacy / immutability / feedback ratchet |

## Decisions

- **Digest, not raw input.** The privacy-sanitizer already strips PII before the
  provider call; the log stores only a hash of that sanitised input + a bounded
  summary. A raw-prompt column is impossible by construction (ratchet-enforced).
- **DB trigger over app-only immutability.** An app-layer "no update" convention
  is bypassable by a raw query; the trigger makes append-only a hard guarantee
  while still allowing the one-way feedback stamp.
- **Reuse Epic E, not MLflow.** New metrics slot into the existing OTel meter —
  no new tracking stack.
- **Pairs with the AI-System Registry (P1).** `aiSystemId` links a decision to a
  registered system, so a high-risk system's decisions become its Art 12 record.

## Not doing

- Storing raw prompts / PII (digest + sanitised summary only).
- MLflow / a new tracking stack (reuse Epic E OTel).
- The RAG pillar / an ML injection classifier (separate items).

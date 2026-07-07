# 2026-07-07 — PR-10: Conversational compliance assistant (governed, propose-not-commit)

**Commit:** `<pending>` PR-10 — conversational assistant

## Design

The final roadmap PR adds a **read-mostly, governed conversational assistant**.
A natural-language question is answered from the tenant's live posture data; an
action request is **queued for human approval**, never executed directly.

```
POST /api/t/{slug}/assistant/ask  { question }
        │  requirePermission('controls.view')
        ▼
askAssistant(ctx, { question })
        │  enforceFeatureGate → checkRateLimit          (cost/abuse gate)
        │  guardUntrustedInput(question)                (AISVS — prompt-injection)
        ├─ READ intent  → getDashboardData(ctx).stats → formatted answer
        └─ ACTION intent → createAgentProposal(ctx, { kind, payload })  ← EXISTING queue
        │  guardEgress(message)                         (secret/exfil scan)
        │  recordGeneration                             (burn quota only on success)
        ▼
   { kind: 'answer' | 'proposal', message, proposalId? }
```

**The load-bearing decision: reuse the existing propose-not-commit gate.** The
repo already ships `agent-proposals.ts` (`AgentProposal` model + API routes +
review UI) — a human approves a PENDING proposal, which then runs the *real*
create-usecase with its own validation/sanitisation/audit. Rather than invent a
parallel `AssistantProposal` model, the assistant's action branch calls
`createAgentProposal(ctx, { kind: 'FINDING' | 'RISK', ... })`. There is ONE
proposal queue, ONE approve path, ONE audit shape. (An earlier draft of this PR
added a duplicate `AssistantProposal` table + migration; it was reverted once
the existing queue was found — verify-and-extend, not rebuild.)

Read answers come from the stable `getDashboardData(ctx).stats` shape (typed
`DashboardStats`, documented as append-only) so the assistant never depends on
row-level field names, and every read is RLS-scoped through the usecase.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/assistant.ts` | `askAssistant` — governed router: read → stats answer; action → agent-proposal |
| `src/app/api/t/[tenantSlug]/assistant/ask/route.ts` | POST route, `controls.view`-gated, `AskAssistantSchema`-validated |
| `tests/unit/usecases/assistant.test.ts` | governance ordering, tenant-scoped reads, propose-not-commit, guard-block |
| `tests/guards/assistant-ai.test.ts` | structural ratchet (ordering, no create-usecase import, route wiring) |
| `tests/guards/ai-guard-coverage.test.ts` | registered assistant in `AI_GUARD_COVERAGE` |

## Decisions

- **Deterministic intent router first.** Keyword routing (not an LLM tool-use
  loop) keeps the first cut auditable and testable. The governance +
  tenant-scoping + propose-not-commit invariants are independent of the router,
  so a provider-backed loop can slot in behind the same guards later.
- **Backend + API only, mirroring PR-9.** The questionnaire-AI PR shipped
  backend + API with no page/nav; PR-10 matches that scope. A chat UI surface is
  a documented follow-up.
- **Read permission is sufficient to propose.** Proposing lands in the review
  queue where a *write*-holder approves, so `controls.view` gates the ask route
  without widening who can create records.

## Follow-ups (roadmap-sanctioned, deferred)

- **Chat UI surface** — a conversational panel over `POST /assistant/ask`.
- **Jira / external remediation ticketing** — pushing an approved
  finding/task to an external tracker. This is net-new outbound-integration
  scope (OAuth app, field mapping, webhook-back) and is deferred rather than
  stubbed; it plugs into the same approved-proposal seam.
- **Provider-backed tool-use loop** — richer NL understanding behind the
  existing guard/gate ordering.

# 2026-06-08 — Visual Rule Editor VR-9: AI Rule Suggestions in the Control Right-Rail

**Commit:** `<sha>` feat(automation): VR-9 — AI automation suggestions in the Control-page rail

## What changed vs. the roadmap

The roadmap framed VR-9 as a canvas ✨ slide-in panel ("Add to canvas"). Per
user direction, VR-9 instead surfaces the AI **rule suggestions** in the
**right-rail on the Control page** — the same `AsidePanel` + `AiAssistRail`
pattern the product already uses for risk AI. This decouples VR-9 from the
canvas/VR-3 sync entirely (built off `main`, not the VR pipeline) and puts the
suggestions where a practitioner reviews a control's gaps.

## Design

```
getAutomationSuggestions(ctx)               usecase (read-gated)
  ├─ posture: active risk count + ENABLED rules' trigger events
  └─ rankRuleSuggestions(posture)           PURE, unit-tested
       • candidate automations (control-test-fail notify, risk→task, …)
       • drop any trigger event already covered by an ENABLED rule
       • score (posture-weighted) → sort → 1-based ranks
GET /api/t/[slug]/ai/automation-suggestions  thin route
AutomationSuggestionsRail                     rail content (SWR)
  └─ mounted via EntityDetailLayout `rail` → <AsidePanel surfaceKey=controls-detail-ai>
       on the Control detail page
```

## Decisions

- **Deterministic heuristic, not an LLM.** The ranker is a pure function over
  posture counts — works with zero AI keys, is fully unit-testable, and is
  cheap enough to recompute on every rail open. (The `src/app-layer/ai`
  OpenRouter provider exists for richer future suggestions; VR-9 deliberately
  doesn't depend on it.)
- **Never proposes a duplicate.** A candidate whose trigger event is already
  covered by an ENABLED rule is filtered out, so the rail only ever shows net-
  new automation.
- **"Create draft" writes a valid DRAFT rule** with a minimal valid action
  config (NOTIFY_USER → `{ userIds: [me], message: title }`; CREATE_TASK →
  `{ title }`) so it passes the create schema; the user refines recipients/task
  fields in the builder. Current user id comes from the session inside the rail.
- **Right-rail integration uses the existing seam** — `EntityDetailLayout.rail`
  (the Control detail page had no rail before; this is its first) + `AsidePanel`
  (collapse / resize / Sheet-fallback / `?aside=` deep-link for free),
  mirroring the Risks list AI rail.
- Suggestions use only trigger events that exist today (RISK_*, TEST_RUN_FAILED,
  ISSUE_CREATED) — no new event taxonomy.

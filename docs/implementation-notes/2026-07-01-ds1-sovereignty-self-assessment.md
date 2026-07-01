# 2026-07-01 — DS-1: Digital Sovereignty Posture self-assessment (backend)

**Commit:** `<pending>` feat(onboarding): digital sovereignty posture self-assessment (backend)

## Design

The first slice (DS-1) of the Digital Sovereignty Posture self-assessment —
a getting-started, onboarding-surfaced posture check distinct from the AI
governance self-assessment. It answers "how exposed is our EU-market digital
sovereignty?" across six dimensions and, on explicit approval, seeds the risk
register + control library with the gaps it surfaces.

Six dimensions × five questions = 30. Each question carries five ordered
options scored 0 (none) → 4 (leading). Dimension score = mean of its answered
questions; overall = mean of the scored dimensions, surfaced both 0–4 and as a
0–100 badge with a maturity band (Exposed / Emerging / Managed / Sovereign-ready).
A dimension scoring below the gap threshold (2) yields a *suggestion template*.

The load-bearing boundary is **propose-not-commit**, mirroring the MCP write
model:

```
data (pure content)  ──►  scoring (pure, isomorphic)  ──►  usecase (commits)
digital-sovereignty.ts     scoring.ts                       self-assessment.ts
   30 Qs + templates        mean/band/gap suggestions          createRisk / createControl
                            NO usecase import                   assertCanWrite + dedupe
```

- `src/data/self-assessments/digital-sovereignty.ts` — pure content. Imports
  nothing. Regulatory material is clause-REFERENCED only (short identifiers:
  EUCS, GDPR Ch. V, eIDAS 2.0, DORA Art 28, AI Act EU 2024/1689 …), never
  regulatory prose. Six-dimension model derives from the MIT-licensed
  Digital-Sovereignty-Assessment-Tool; the clause-cite discipline is ours.
- `src/lib/self-assessments/scoring.ts` — pure, isomorphic scorer +
  suggestion builder. Runs identically client- and server-side; imports no
  usecase and calls no create-usecase. It *proposes* (returns plain
  `GapSuggestion` objects); it never commits.
- `src/app-layer/usecases/self-assessment.ts` — the ONE commit path.
  `materializeSelfAssessmentSuggestions` re-scores server-side from the
  submitted answers (never trusts a client-sent score), keeps only approved
  dimensions genuinely below the threshold, and writes via the existing
  `createRisk` / `createControl` usecases (each hash-chain audited).
  Idempotent: dedupes by `(category = 'Digital Sovereignty', title/name)` so
  re-runs never double-create.
- `src/app/api/t/[tenantSlug]/onboarding/sovereignty-assessment/materialize/route.ts`
  — `withApiErrorHandling` + `withValidatedBody`, mutation-tier rate-limited.

Nothing is written automatically — materialisation is gated on an explicit,
per-dimension `{ createRisk, createControl }` approval from the "Create these?"
review step.

## Files

| File | Role |
| --- | --- |
| `src/data/self-assessments/digital-sovereignty.ts` | Pure content bank — 6 dimensions, 30 questions, suggestion templates, bands, threshold |
| `src/lib/self-assessments/scoring.ts` | Pure isomorphic scorer + gap-suggestion builder (propose) |
| `src/app-layer/schemas/self-assessment.ts` | Zod: assessment-key enum + materialize input |
| `src/app-layer/usecases/self-assessment.ts` | Registry + the sole commit path (approval-gated, idempotent) |
| `src/app/api/.../sovereignty-assessment/materialize/route.ts` | POST → materialize approved gaps |
| `tests/unit/self-assessment.test.ts` | Scorer + usecase unit tests (DB/createRisk/createControl mocked) |
| `tests/guardrails/sovereignty-self-assessment-coverage.test.ts` | Content + propose-not-commit invariants ratchet |

## Decisions

- **Stateless, not persisted (this slice).** Unlike the AI-governance
  self-assessment (which persists answers to dedicated Prisma models), DS-1
  keeps the assessment client-held and only crosses the server boundary to
  *materialize*. No new Prisma model ⇒ no RLS / retention-classification
  surface to add. Persisting progress (resume-later) is a candidate follow-up,
  not a DS-1 requirement.
- **Server always re-scores.** The materialize input carries answers +
  approvals, never a score. The server recomputes the gap set and drops any
  approval that doesn't map to a genuine below-threshold gap — a tampered or
  stale client can't conjure a risk/control for a passing dimension.
- **Idempotency by category, not by a stored assessment id.** Because the flow
  is stateless, dedupe keys off the materialised records themselves
  (`category = 'Digital Sovereignty'` + exact title/name). Re-running the same
  answers is a no-op; the result reports `skipped`.
- **Clause-reference discipline over prose.** The bank cites short regulatory
  identifiers and never embeds ISO / EU-regulation text — the same
  license-safe posture the AI-gov and NIS2 assessments take. Locked by the
  coverage ratchet.
- **`labelKey`, not hard-coded labels.** Dimensions carry i18n keys for the
  (later-PR) UI to resolve via next-intl; the backend never renders copy.

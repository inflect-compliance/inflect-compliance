# 2026-06-11 — RQ2-1 per-mutation score provenance & residual decomposition

**Commit:** `<sha>` feat(risk): per-mutation score provenance + residual decomposition (RQ2-1)

First PR of the RQ2 roadmap (#983–#993) — the layer that makes every
risk score traceable, on top of the merged RQ-1…RQ-10 quantification
epic.

## Design

- **`RiskScoreEvent`** — the mutation ledger. Exactly one row per
  score-changing write, carrying kind (INHERENT|RESIDUAL), the
  dimensions + rollup, **source provenance**
  (USER|DERIVED|PLAN|AI|MIGRATION), optional justification, and the
  acting user. Boundary vs RQ-9's `RiskSnapshot` is documented on the
  model: snapshots are *cadence* records for trends (daily cron);
  events are *mutation* records for explainability + audit narrative.
  Neither substitutes for the other.
- **`recordScoreEvent(db, tenantId, input)`** — single write seam,
  deliberately a plain function over the in-flight `PrismaTx` so the
  ledger commits/rolls back atomically with the score write itself.
  Its input type `Exclude<…, 'MIGRATION'>` makes backfill provenance
  unforgeable from application code.
- **Residual decomposition** — `Risk.residualLikelihood/-Impact`
  (nullable). `updateRisk` accepts the pair (both-or-neither,
  enforced at Zod *and* usecase layers) and **derives**
  `residualScore` via `calculateRiskScore` — a caller can never
  assert a raw rollup. Divisor-era rows keep their rolled-up score;
  their ledger anchor carries 0/0 sentinel dimensions ("not
  decomposed").
- **Wire-in sites** — `createRisk` (INHERENT/USER),
  `createRiskFromTemplate` (INHERENT/USER + template provenance in
  justification), `updateRisk` (INHERENT and/or RESIDUAL, USER),
  `completePlan` (RESIDUAL/PLAN; the strategy-divisor formula
  survives until RQ2-2 replaces it with control-effectiveness
  derivation — but its writes are now *attributed*).
- **Docstring honesty** — `inherentScore`'s schema doc now states
  what the code has always done (moves with every L/I edit; the
  history lives in the ledger), replacing the "never overwritten"
  claim that `updateRisk` contradicted.
- **Backfill** — migration inserts one INHERENT anchor per existing
  risk and one RESIDUAL anchor per divisor-era residual, all
  source=MIGRATION, timestamped from the best available column.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/enums.prisma` | `RiskScoreEventKind`, `RiskScoreEventSource` |
| `prisma/schema/compliance.prisma` | `RiskScoreEvent` model; `residualLikelihood/-Impact`; honest docstrings |
| `prisma/schema/auth.prisma` | Tenant back-relation |
| `prisma/migrations/20260611100000_rq2_1_score_events/` | Table + RLS (RQ-9 template) + backfill |
| `src/app-layer/usecases/risk-score-events.ts` | `recordScoreEvent` seam + `listScoreEvents` read path (batched actor attach) |
| `src/app-layer/usecases/risk.ts` | Three wire-in sites + both-or-neither residual contract |
| `src/app-layer/usecases/risk-treatment-plan.ts` | PLAN-source residual event |
| `src/lib/schemas/index.ts` | `UpdateRiskSchema` residual pair + refine |
| `tests/unit/risk-score-events.test.ts` | Seam + wiring behavior (19 assertions) |
| `tests/integration/risk-score-events.test.ts` | DB-backed: transactional pairing, derivation, isolation |
| `tests/guardrails/risk-score-provenance.test.ts` | Pairing ratchet (see below) |

## Decisions

- **Ledger ≠ snapshot.** RQ-9 already records daily state; adding
  per-mutation rows to that table would have mixed two write cadences
  and two consumers (trend charts vs explainability) on one index
  shape. Separate table, explicit boundary comment.
- **0/0 sentinel for un-decomposed residuals.** Divisor-era and
  PLAN-written residuals have no likelihood/impact split. NULLs on a
  NOT NULL ledger column pair were rejected in favor of a 0 sentinel
  (real assessments clamp ≥ 1, so 0 is unambiguous) — keeps the
  common-case queries simple.
- **`justification` stays out of the encryption manifest.** It
  carries the same operational metadata `AuditLog.details` already
  records for these mutations; encrypting it would buy nothing and
  cost every explainer read.
- **The divisors live one more PR.** Killing them here would have
  coupled schema + provenance + a scoring-model change in one diff.
  RQ2-2 owns that change; today their output is at least attributed
  (source: PLAN).

## Ratchet

`tests/guardrails/risk-score-provenance.test.ts` fails CI when: a
score write site loses its paired `recordScoreEvent`; `updateRisk`
accepts a raw `residualScore`; the both-or-neither contract drops
from either layer; the migration loses RLS or backfill clauses;
application code writes MIGRATION-source events; or the seam stops
taking the in-flight `PrismaTx`.

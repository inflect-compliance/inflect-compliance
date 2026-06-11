# 2026-06-11 — RQ2 epic capstone: the score that earns its trust

**Commits:** PRs #994–#1004 (RQ2-1..10), #1006–#1020 (polish 1–15), #1021 (CI disk reclaim)

## What the epic was for

The merged RQ-1..10 quantification epic gave the product FAIR
machinery (PERT triples, Monte Carlo, LECs, appetite, bow-ties).
RQ2 closed the gap underneath it: **the qualitative score itself
was unaccountable**. It moved without provenance, residuals came
from divisor folklore (`score/5`), the two risk languages never
spoke, and four independent severity ladders disagreed the moment
a tenant customised bands.

## The ten moves

| PR | What changed | The honesty principle |
| --- | --- | --- |
| RQ2-1 #994 | `RiskScoreEvent` ledger — one row per score-changing write, with source provenance (USER/DERIVED/PLAN/AI/MIGRATION) + decomposed residual dims | A score nobody can audit is an assertion, not an assessment |
| RQ2-2 #995 | Control-derived residual: `1−∏(1−eᵢ)` routed by mitigationType, MEASURED beats DECLARED, propose-don't-overwrite | Derive from evidence or honestly write nothing — never fabricate |
| RQ2-3 #996 | ScoreExplainer popover — every chip answers who/when/why in the tenant's matrix language | The number must explain itself where it's read |
| RQ2-4 #997 | Guided assessment tab (inherent → controls → residual), 10→8 tab IA | Make the right workflow the easy one |
| RQ2-5 #998 | Coherence detector (rank-quartile disagreement), side-by-side ALE, matrix ALE heat overlay | Two languages, one register — contradictions surface themselves |
| RQ2-6 #999 | Appetite per-risk cap on the LEC (the Σ-ceiling stays an annotation — a line would lie), breach → one remediation task | Thresholds belong where decisions are made |
| RQ2-7 #1001 | Calibration aids: plain-language reflections, warn-only validators, category priors; AI accepts get AI-source provenance | Feedback at entry beats correction at review; warn, never block |
| RQ2-8 #1002 | Staleness engine (review overdue / assessment aged / controls moved since) | The register stops rotting silently; absence of data ≠ staleness |
| RQ2-9 #1003 | Matrix movement view — inherent → residual arrows, decomposed-only | Show what the treatment bought; legacy rows draw nothing rather than lies |
| RQ2-10 #1004 | Band unification — one resolver, legacy ladders frozen by importer-set ratchets | One severity vocabulary per tenant, enforced structurally |

## The fifteen polish items (#1006–#1020)

Three categories: visible honesty (a11y labels, movement legend, AI
attribution grammar, direction chips, rot tints), drift removal
(one currency formatter, traceability dividers, zero-probability
nudge, Level tooltips, quantification empty-state), and closed
loops (ALE → FAIR tab, breach ↔ task deep links, persisted overlay
toggles, Escape handling, the residual-baseline conflict warning).

## Ratchet inventory added by the epic

`risk-score-provenance` · `risk-score-explainer` ·
`rq2-4-assessment-ia` · `rq2-5-coherence` · `rq2-6-appetite-lec` ·
`rq2-7-calibration` · `rq2-8-staleness` · `rq2-9-matrix-movement` ·
`rq2-10-band-unification` · `polish-01-score-chip-a11y` ·
`polish-06-single-currency` — each locks a regression class, each
carries the reasoning in its header.

## Capstone audit results (this PR)

Run against merged main, clean checkout, `npm ci`:

- typecheck clean, lint 0 errors
- 572 static guard suites / 7,465 tests green
- 13,372 unit + contract tests green (68 snapshots)
- 1,187 integration tests green against real Postgres + RLS
- all 10 per-PR implementation notes present
- no RQ2-tagged TODO/FIXME debt left in `src/`

## Known follow-ups (deliberately out of scope)

- The `getRiskScoreBand` holdout on the risk detail header (frozen
  by the RQ2-10 ratchet; migrate when that page gains a matrix
  config fetch for other reasons).
- AI-proposed PERT triples (RQ2-7 shipped the provenance half; the
  prompt-schema half rides the existing AI pipeline when wanted).
- Per-tenant `MAX_ASSESSMENT_AGE_DAYS` config (RQ2-8 hardcodes an
  honest 180; add to `TenantSecuritySettings` on demand).
- CI disk-reclaim (#1021) generalisation to other image-heavy jobs
  if new ones appear.

# 2026-06-11 — RQ2-7: calibration aids for the FAIR inputs

**Commit:** _(this commit)_ — reflections, warn-only validators, category priors, AI provenance

## Design

The RQ-1 FAIR inputs were raw floats: a typo'd order of magnitude
produced a confidently wrong ALE with zero feedback. Martin-Vegue's
calibration discipline lands as three advisory layers in
`src/lib/fair-calibration.ts` (pure — mirrors `risk-residual.ts`):

**Reflections.** `reflectFairInput(key, value)` mirrors every
numeric FAIR input in plain language, live under the field:
"TEF 0.1 → a threat event is expected about one event every 10
years"; "PLM 250000 → each primary loss event costs about €250K";
"threat capability 8/10 → nation-state / top-percentile attacker".
The TS switch is exhaustive over `FairFieldKey`, so a new FAIR
input cannot ship reflection-less without a compile error.

**Warn-only validators.** `validateFairInputs` flags probabilities
outside 0–1 (the vulnerability > 1 classic), 1–10 scale fields out
of range, negative money/frequencies, and a TEF override wildly
above contact × P(action). `validatePertTriple` flags inverted
ranges and magnitude ranges spanning >3 orders. By CONTRACT these
never block: the save button's disabled state couples to `saving`
only (ratchet-pinned) — calibration is judgement, and the assessor
may know something the validator doesn't.

**Category priors.** `CATEGORY_PRIORS` — a small static library of
order-of-magnitude anchors per risk category ("typical ransomware
TEF for a mid-size org: 0.05–0.5/yr"), rendered as ghost text on
the TEF + loss groups. Anchors, not answers; unknown categories
render nothing.

**AI provenance (RQ2-1 closure).** `applySession` (the AI
risk-suggestion accept path) created risks via raw `db.risk.create`
with NO ledger event — accepted AI scores were unattributed. It now
records an `INHERENT / source: 'AI'` event per created risk, with
the suggestion's rationale as the justification.

## Files

| File | Role |
| --- | --- |
| `src/lib/fair-calibration.ts` | Reflections + validators + priors (pure) |
| `…/risks/[riskId]/FairAnalysisPanel.tsx` | Live wiring of all three layers |
| `…/risks/[riskId]/page.tsx` | Passes `risk.category` for priors |
| `src/app-layer/usecases/risk-suggestions.ts` | AI-source ledger event on accept |
| `tests/unit/fair-calibration.test.ts` | 35 pure-math assertions |
| `tests/rendered/fair-calibration-panel.test.tsx` | Live reflections / advisory warnings / priors |
| `tests/guards/rq2-7-calibration.test.ts` | Wiring + warn-only + provenance ratchet |

## Decisions

- **Warn, never block — enforced structurally.** The ratchet bans
  `disabled={…warnings…}` on the save button. A blocking validator
  would push assessors back to not quantifying at all.
- **Priors are deliberately coarse.** Public-report-scale ranges;
  the value is the order-of-magnitude anchor. Embedding precise
  "industry data" would manufacture false authority.
- **AI suggestion ranges deferred to the existing PERT machinery.**
  The issue's "AI proposes PERT triples" reduces to prompt-schema
  work on the existing pipeline; the provenance half (the part with
  an integrity cost) ships here. Proposing triples without the
  calibration UI would have been pseudo-rigor in the other
  direction.

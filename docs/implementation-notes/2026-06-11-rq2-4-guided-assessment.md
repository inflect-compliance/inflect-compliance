# 2026-06-11 — RQ2-4: guided assessment + detail-page IA consolidation

**Commit:** _(this commit)_ — RQ2-4 Assessment tab + 10→8 tab rationalization

## Design

Before this PR, the qualitative assessment was two bare 1–5
dropdowns buried in the Edit Risk modal, while the quantitative
world (FAIR, bow-tie, history) had five dedicated tabs. The new
**Assessment** tab makes the qualitative flow first-class and
sequences it the way an assessor actually thinks:

```
1 · Inherent     L/I NumberSteppers labelled from the tenant's
                 RiskMatrixConfig.levelLabels; live band chip
                 (canonical resolveBandForScore) shows the
                 consequence of each click before saving.
2 · Controls     The RQ2-2 contribution breakdown: participating
                 controls (MEASURED beats DECLARED, dimension
                 routing visible), excluded controls WITH the
                 reason (no effectiveness signal / no mitigation
                 type) — the data-quality nudge stays on screen.
3 · Residual     Asserted vs control-suggested side by side.
                 Accept → POST (justification only; server-side
                 recompute). Manual override → decomposed dims +
                 scoreJustification; rollup derived server-side
                 (RQ2-1 provenance fires either way).
```

A "Quantify this risk" bridge switches to the FAIR tab in place —
one narrative, two depths. A "Link controls in Traceability" bridge
appears when the risk has zero linked controls.

**Tab IA: 10 → 8.** The bar was overview / quantification / bowtie /
history / tasks / evidence / mappings / traceability / activity /
tests. Changes:

- `assessment` added (second position — it's the core workflow).
- `mappings` + `tests` demoted: both were inherited-via-controls
  panels; they now render as sections under **Traceability**, beside
  the control links they derive from.
- `activity` deleted: it was an EmptyState stub; score provenance
  now lives in the RQ2-3 explainer + the History tab.

## Files

| File | Role |
| --- | --- |
| `…/risks/[riskId]/RiskAssessmentPanel.tsx` | The guided three-step panel |
| `…/risks/[riskId]/page.tsx` | 8-tab IA, assessment wiring, traceability sections |
| `tests/rendered/risk-assessment-panel.test.tsx` | Behavioural contract (8 tests) |
| `tests/guards/rq2-4-assessment-ia.test.ts` | IA + contract ratchet |
| `tests/guardrails/b6-usezodform-adoption.test.ts` | Risks exits the canonical 7-tab club (documented) |

## Decisions

- **NumberStepper + formatValue, not a labelled Combobox.** The
  stepper communicates ordinality (level 3 is between 2 and 4);
  `formatValue` renders "3 — Possible" so the tenant's language
  stays primary. Falls back to bare numerals when labels are unset.
- **Creation modal untouched.** Depth lives on detail (issue
  mandate); the modal's L/I fields remain the quick-capture path.
- **Both save buttons are `secondary`.** The primary-action budget
  ratchet caps primaries at 1/file and the repo ceiling was already
  tight; the buttons appear only when dirty/overriding, so visual
  hierarchy is carried by conditional presence, not color.
- **The B6 7-tab guard now excludes Risks** with a pointer to the
  new `rq2-4-assessment-ia` ratchet — changing a ratchet in the
  same diff as the feature it documents is the intended protocol.
- **Suggestion payload reloaded after every save** so step 2/3
  always reflect the just-written state (inherent edits change the
  suggestion's baseline).

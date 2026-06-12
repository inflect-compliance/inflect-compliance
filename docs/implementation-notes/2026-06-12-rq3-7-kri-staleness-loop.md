# 2026-06-12 — RQ3-7: KRI ⇄ assessment loop — sensors finally update beliefs

**Commit:** _(see PR — `feat(rq3-7): close the KRI ⇄ assessment loop — SIGNAL_MOVED staleness reason + re-assess nudge`)_

## Design

RQ-6's Key Risk Indicators were sensors wired to nothing: a breached
indicator changed no conclusion anywhere. Sensors that don't update
beliefs are decoration. RQ3-7 closes the loop with one new staleness
reason and two UI affordances that route a breach to the
re-assessment it should trigger.

**`SIGNAL_MOVED` — the fourth staleness reason.** The pure detector
(`src/lib/risk-staleness.ts`) gains a `latestKriBreachAt` signal and
a fourth reason. It fires when a linked KRI's breach is NEWER than
the last assessment — the sensor moved and the score never caught up
— OR when the risk was never assessed (a live signal against a
non-existent conclusion). The no-noise contract holds end to end: a
breach the belief already absorbed (older than the last assessment)
doesn't fire, and a recovery (a later non-RED reading) drops the
signal entirely upstream, so re-assessing OR the indicator
recovering both silence the reason.

**The breach signal, batched.** The loader
(`usecases/risk-staleness.ts::loadLatestKriBreaches`) computes, per
risk, the newest reading of each linked active KRI and keeps only
those whose latest reading sits in RED — `recordedAt` is the breach
timestamp. Two bounded reads (groupBy `_max` for the newest
timestamp per KRI, then one narrow `findMany` of exactly those rows
to learn their RAG band — groupBy can't return the band of the max
row), then in-memory folds. No per-risk query. The helper is hoisted
above the main function so its awaits don't textually interleave
with the main function's loops.

**The re-assess nudge.** `getRiskKriBreaches(ctx, riskId)` returns
the risk's currently-RED KRIs (newest breach first). A new
`GET /risks/:id/kri-breaches` serves it; the Assessment tab fetches
it failure-soft and renders a warning banner
(`kri-reassess-nudge`) above Step 1 when any KRI is breached: "a
leading signal has moved since this risk was last assessed —
re-assess …". The banner disappears automatically once the KRI
recovers.

**The deep-link.** The KRI page surfaces a "Re-assess the linked
risk →" link on any card that is both RED and linked to a risk,
targeting `/risks/:id?tab=assessment`. The risk detail page now
honours a `?tab=<key>` query param on first mount (validated against
the tab set; invalid → overview), so the breach is one click from
the re-assessment.

## Files

| File | Role |
| --- | --- |
| `src/lib/risk-staleness.ts` | `SIGNAL_MOVED` reason + `latestKriBreachAt` signal + description |
| `src/app-layer/usecases/risk-staleness.ts` | `loadLatestKriBreaches` (batched) wired into the loader |
| `src/app-layer/usecases/key-risk-indicator.ts` | `getRiskKriBreaches` for the per-risk nudge |
| `src/app/api/t/[tenantSlug]/risks/[id]/kri-breaches/route.ts` | the nudge endpoint |
| `src/app/t/[tenantSlug]/(app)/risks/[riskId]/RiskAssessmentPanel.tsx` | the re-assess nudge banner |
| `src/app/t/[tenantSlug]/(app)/risks/kri/page.tsx` | the deep-link on breached cards |
| `src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx` | `?tab=` deep-link honoured on mount |
| `tests/guards/rq3-7-kri-staleness-loop.test.ts` | the ratchet |
| `tests/guards/rq2-8-staleness.test.ts` | N+1 check upgraded to brace-aware (below) |

## Decisions

- **"Breached" = latest reading is RED, not "a worsening crossing
  happened once".** The staleness question is "is the world worse
  than the belief NOW", and a recovery should silence it. Keying on
  the current band (not the historical crossing event) makes
  un-breaching free — no event to expire, no flag to clear.
- **The detector stays pure.** The loader resolves the breach to a
  single timestamp; the detector only compares it to the last
  assessment. Same shape as the other three reasons — the rendered
  + integration tests exercise the loop, the unit tests pin the
  pure logic.
- **`?tab=` deep-link is minimal, not the full OB-C scope.** RQ3-7
  needs exactly one thing — land on the Assessment tab from the KRI
  card. The broader tab-URL sync (back/forward, replaceState on tab
  change) is OB-C's job; this reads the param once on mount.
- **The RQ2-8 N+1 ratchet was made brace-aware.** The prior
  `for \(...\) \{[\s\S]*?await db\.` regex false-flagged a file with
  two functions that each legitimately batch-then-loop (RQ3-7 added
  the second). The new form brace-matches each `for (` / `while (`
  HEADER to the end of its block and asserts no `await db.` inside —
  it still catches a genuine read-in-loop (verified) while not
  tripping on batch-then-loop. A tightening, not a weakening.
- **Ratchet shape** (`rq3-7-kri-staleness-loop.test.ts`): pins the
  reason + signal + no-noise gate in the detector; the batched
  groupBy breach load + the RED filter in the loader; the
  `getRiskKriBreaches` usecase + endpoint; the Assessment nudge; the
  KRI-page deep-link conditioned on RED + linked; and the detail
  page's `?tab=` honouring.

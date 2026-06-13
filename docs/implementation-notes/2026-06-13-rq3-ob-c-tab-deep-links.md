# 2026-06-13 — RQ3-OB-C — Tab deep-link discipline

**Commit:** `pending` (branch `claude/rq3-ob-c-tab-deep-links`)

## Design

RQ3-7 established the `?tab=` query-param pattern on the risk detail page:
the KRI page's re-assess link deep-links into `/risks/:id?tab=assessment`
so a breached signal is one click from the re-assessment. The detail page
honours the param on first mount via a validated `useSearchParams` read.

The pattern was correct; only one entry point used it. This PR extends the
pattern to the four other surfaces that surface a risk row pointing at a
re-evaluation:

| Surface | Old href | New href | Why |
| --- | --- | --- | --- |
| Dashboard staleness widget | `/risks/:id` | `/risks/:id?tab=assessment` | Closing rot signals (AGED / REVIEW_OVERDUE / CONTROLS_MOVED_SINCE / SIGNAL_MOVED) all happen in Assessment |
| Dashboard coherence widget | `/risks/:id` | `/risks/:id?tab=assessment` | Resolving a qual↔quant contradiction means re-assessing one of the two scores |
| Dashboard overdue-reviews list | `/risks/:id` | `/risks/:id?tab=assessment` | The list's entire point is the review |
| Board page top-contributors row | `/risks/:id` | `/risks/:id?tab=assessment` | The exec wants the headline view; Assessment is it |

The dashboard's **top-by-ALE** row stays bare — that's a quantification
context (an exec might want the full picture from Overview), and the
Quantification tab is where FAIR inputs live anyway. Deliberate.

## Files

| File | Role |
| --- | --- |
| `src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx` | 3 row hrefs gain `?tab=assessment` |
| `src/app/t/[tenantSlug]/(app)/risks/board/page.tsx` | Top contributors row gains `?tab=assessment` |
| `tests/guards/rq3-ob-c-tab-deep-links.test.ts` | 4 structural ratchets, one per surface |

## Decisions

- **`?tab=assessment` everywhere, not `?tab=overview`.** Every surface in
  this PR has the same destination because all four reasons-to-click resolve
  in the same tab. Cross-PR consistency over per-surface micro-targeting.
- **No usecase / endpoint changes.** Pure UI deep-linking. The detail page
  already honours `?tab=` per RQ3-7; this PR only changes where the link
  points.
- **Ratchet structure-only.** The ratchet pins the exact `href={href(...)}`
  template literal at each call site. A "refactor to a helper" PR that
  changes the template shape would need to update the regex — which is the
  right time to revisit the contract.

# 2026-06-17 — Canonical KPI-card sparklines (PR1: data-first)

**Commit:** `<pending>` feat(charts): canonical KPI sparkline pipeline + apply to 5 entities

## Design

Assets' KPI cards showed per-metric sparklines (real daily history) via a
bespoke inline fetch + series builder. This extracts that into ONE shared
pipeline and applies it to the other entity KPI pages, so the six pages share
a single cached trends request and an identical, truthful sparkline path.

```
useKpiTrends(tenantSlug)            // shared 30-day /dashboard/trends fetch, one cache key
  → TrendPayload.dataPoints
buildKpiSparklines(points, anchor, pickers)
  → trims leading defaulted-zero prefix (gated on the entity total) so a
    metric's pre-existence history isn't a fake ramp; date-aligns every series
centeredSparklineDomain(series)     // row of sparklines on one vertical level
  → fed per card to <KpiFilterCard sparkline … sparklineDomain … />
```

Phased per the operator decision (data-first): **PR1 sparklines only the cards
that already have a truthful daily series**; cards without one stay value-only
(no fake line). Cards needing new snapshot columns + a backfill are PR2/PR3
(tracked separately).

## Card → series coverage (PR1)

| Entity | Sparklined cards | Value-only (no series yet) |
|---|---|---|
| Assets | total · active · critical · retired | — |
| Controls | total · implemented · inProgress · notStarted | — |
| Risks | total · open | avgScore · overdue |
| Vendors | total · reviewOverdue | active · critical |
| Evidence | total | draft · submitted · approved |
| Policies | total | draft · inReview · approved |

## Files

| File | Role |
|------|------|
| `src/lib/charts/kpi-trends.ts` | **new** canonical module: `useKpiTrends` + `buildKpiSparklines` + `centeredSparklineDomain` |
| `src/lib/assets/asset-sparkline.ts` | re-exports `centeredSparklineDomain` from the canonical module (back-compat) |
| `src/app-layer/usecases/compliance-trends.ts` | expose 6 already-populated-but-hidden series in `TrendDataPoint`/`toDataPoint` (controlsTotal/InProgress/NotStarted, evidenceTotal, vendorsTotal/OverdueReview) — no schema change, no backfill |
| `…/(app)/{assets,controls,risks,evidence,policies,vendors}/*Client.tsx` | wire the shared hook → per-card sparklines (Assets migrated off its inline copy) |
| `tests/unit/charts/kpi-trends.test.ts` | helper contract (trim/align, centered domain) |
| `tests/guards/kpi-sparkline-canonical.test.ts` | every entity uses the shared pipeline + feeds a card a sparkline; no per-page trends fetch remains |

## Decisions

- **No schema/backfill in PR1.** All six exposed series already had populated
  `ComplianceSnapshot` columns; they just weren't surfaced in `TrendDataPoint`.
  Adding them is a pure read-path change — zero deploy risk.
- **No-data cards render value-only.** Risk avgScore/overdue, Vendor
  active/critical, and the Evidence/Policy status buckets have no daily column
  yet. Rather than fake a line, those cards omit the sparkline (KpiFilterCard
  already draws nothing below 2 points). Adding their columns + job + backfill
  is the PR2/PR3 expansion.
- **Truthful-history trim is generic.** `buildKpiSparklines` trims the leading
  all-zero prefix gated on the entity total (generalizing Assets'
  `firstAssetDataIndex`), so any column added later doesn't render a fake ramp.
- **Shared cache key.** `['kpi-trends', tenantSlug, 30]` — all six pages reuse
  one fetch instead of six.

## Next

- PR2 — new snapshot columns + job population + backfill for the status-bucket
  cards (evidence draft/submitted/approved, policy draft/inReview/approved,
  vendor active/critical) + expose + sparkline them.
- PR3 — Tests KPI row (no cards today) + its snapshot columns + sparklines.

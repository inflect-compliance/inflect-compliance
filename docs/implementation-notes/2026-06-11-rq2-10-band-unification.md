# 2026-06-11 — RQ2-10: band unification + freeze ratchets

**Commit:** _(this commit)_ — one band resolver, frozen legacy ladders

## Design

Pre-RQ2-10 the product carried FOUR independent severity ladders:
the configured `RiskMatrixConfig.bands` (score chip, matrix,
explainer), the RisksClient Level column (`≤5/≤12/≤18` inline), the
PDF register summary (`≥15 / 8–14 / <8` inline), and the two legacy
helpers (`getRiskLevel` fixed percentages,
`getRiskScoreBand` statics). The moment a tenant customised bands,
the Level column and the boardroom PDF silently disagreed with the
matrix on the same page.

**Unified in this PR:**
- RisksClient Level column → `resolveBandForScore(score,
  matrixConfig.bands)` — band name + colour dot, in the tenant's
  vocabulary (the config was already a page prop).
- PDF risk register → `getRiskMatrixConfig(ctx)` + per-band counts
  via the canonical resolver; summary lines render
  `"{band.name} ({min}–{max})"` dynamically (severity-descending),
  and the content hash covers the band counts.

**Frozen, not migrated:**
- `getRiskLevel` (risk-scoring.ts) — zero importers left in `src/`
  after this PR; the ratchet pins the count at zero.
- `getRiskScoreBand` (entity-status-mapping.ts) — one frozen
  holdout (the risk detail header, a display-tone usage on a page
  that doesn't load the matrix config; the RQ2-3 explainer already
  shows the configured bands one click away). The ratchet pins the
  exact call-site set; migrating it ⇒ shrink the list in the same
  diff, adding a site fails CI.

## Files

| File | Role |
| --- | --- |
| `…/risks/RisksClient.tsx` | Level column on tenant bands (`getRiskBand`) |
| `src/app-layer/reports/pdf/riskRegister.ts` | Band-driven summary + hash |
| `tests/guards/rq2-10-band-unification.test.ts` | Unified-surface pins + holdout freeze |

## Decisions

- **Freeze before migrate.** The detail-header holdout is a tone
  decision (StatusBadge variant), not a correctness hole — the
  page's numbers already explain themselves via RQ2-3. Forcing a
  config fetch into that page for a badge colour wasn't worth the
  blast radius; the freeze ratchet stops the debt growing instead.
- **Importer-set equality, not counts.** The ratchet asserts the
  exact file list, so a new call site names itself in the failure.

# 2026-06-27 — ORG_MATURITY radar widget

**Commit:** `<pending>` feat(org-dashboard): ORG_MATURITY radar widget

## What

A second curated org-dashboard widget (after ORG_THREAT_LEVEL): a
self-assessed **security-maturity rating** — a judgment-based CMM level
(1..5) across the 6 NIST CSF 2.0 functions, rendered as a radar with an
overall KPIStat and an over-time trend.

**Credit:** concept ported from Cybether
(github.com/jccyberx/Cybether, **MIT**) — its "Maturity Rating" trend.
Idea only; native reimplementation on the Epic 41 widget engine.

## The load-bearing distinction: maturity ≠ coverage

The org dashboard already shows **derived coverage** (TENANT_LIST + the
portfolio rollup — "how many controls have evidence"). It did NOT have a
**self-assessed maturity** ("how good are we, by professional judgment, at
each capability"). A portfolio can be 90% covered and self-rate maturity 2
(documented, not managed). Different axis, complementary.

This is enforced, not just documented: `getCurrentOrgMaturity` reads
`OrgMaturityRating` rows and NEVER derives the rating from coverage —
coverage only ever appears as an **advisory hint** (`coverageHint`,
`coverageToMaturityBand`). The ratchet asserts the usecase queries
`orgMaturityRating.findMany` and keeps the hint separate.

## Scope decision: ORG-WIDE-SINGLE

The org rates its portfolio-level capability across the 6 fixed CSF
domains. The heavier per-tenant-maturity-with-average alternative was
considered and **rejected** for the widget. The model is per-`(org,
domain)` rating rows, so a future per-tenant overlay (radar polygons per
tenant) is **additive, not a rewrite**.

## Data model — org-scoped, append-only, trend-for-free

`OrgMaturityRating` (org-scoped like the other `org-*` models: global
prisma, `organizationId`, NOT in `TENANT_SCOPED_MODELS` → no per-tenant
RLS / tenant-DEK; `rationale` sanitised at the usecase). Append-only:
current per domain = most-recent by `ratedAt`; the **trend is free** —
each re-rating is already a history row, so `getOrgMaturityTrend` folds
the events into an overall-over-time series with no separate snapshot job.

## Overall score

Simple mean of the rated domains' ordinals (1..5), rounded to 0.1.
**GOVERN is NOT weighted** — documented choice; a future weighting is an
additive change to the average, not a schema change.

## Substantive action audits

`setOrgMaturityRating` is gated on a new ORG_ADMIN permission
`canSetMaturity` (parallel to `canSetThreatLevel`) and emits a new
`ORG_MATURITY_RATING_SET` `OrgAuditAction` (org-audit-coverage requires
it). Autosave per domain (one PUT per domain change).

## Renderer

Radar via the **Epic 59 `RadarChart` primitive** (`chartReady(axes)`,
`maxValue={5}` — never raw SVG); overall via `KPIStat`; alt `view:'trend'`
via the time-series chart; a "Rate maturity" Sheet with one `RadioGroup`
per domain + the coverage hint inline. Staleness: a rating older than
**90 days** renders a "may be stale" note (maturity drifts).

## Files

| File | Role |
|------|------|
| `prisma/schema/enums.prisma` | `MaturityDomain` + `MaturityLevel` + `ORG_MATURITY` type + `ORG_MATURITY_RATING_SET` action |
| `prisma/schema/auth.prisma` | `OrgMaturityRating` model + Organization back-relation |
| `prisma/migrations/20260627140000_org_maturity_rating/` | enums + table + index + FK |
| `src/lib/permissions.ts` | `canSetMaturity` flag (ORG_ADMIN) |
| `src/app-layer/schemas/org-dashboard-widget.schemas.ts` | ORG_MATURITY Zod variant |
| `src/app-layer/usecases/org-maturity.ts` | current / set (audited) / trend / coverage-hint |
| `src/app/api/org/[orgSlug]/maturity/**` | GET current · PUT set · GET trend |
| `src/app/org/[orgSlug]/(app)/OrgMaturityWidget.tsx` | radar + KPIStat + trend + Rate Sheet + staleness |
| `src/app/org/[orgSlug]/(app)/{widget-dispatcher,page}.tsx` | dispatch case + maturity on PortfolioData |
| `src/app-layer/usecases/org-dashboard-presets.ts` | half-width radar at y:8; tenant-list/CTAs shifted down |
| `tests/guardrails/org-maturity-widget.test.ts` | structural ratchet |

## What this is NOT

- Not a replacement for the coverage widgets (third, complementary axis).
- Not auto-computed (human-set; coverage is a HINT only).
- Not tenant-configurable domains (the 6 CSF functions are fixed).
- Not a per-tenant rollup (org-wide-single — but modelled so a tenant
  overlay is additive later).
- Not addable via the WidgetPicker yet (preset-seeded; API/Zod accept it).

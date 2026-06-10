# 2026-06-10 — RQ-2 Risk appetite & tolerance framework

**Commit:** `<sha>` feat(risk): risk appetite & tolerance framework (RQ-2)

Tenant admins define quantitative appetite; the system detects + records breaches
automatically (ISO 31000 / NIST CSF expectation; Archer parity).

## Design

- **Schema** — `RiskAppetiteConfig` (one row/tenant: portfolio ALE ceiling,
  single-risk ALE max, qual-score max, per-category overrides JSON, board
  statement, review cadence) + `RiskAppetiteBreach` (point-in-time breach
  records, resolved when the value drops back). Both additive; opt-in.
- **`risk-appetite.ts`** — the breach MATH is a **pure** `detectBreaches(config,
  risks)` (portfolio / single-risk / qual-score / per-category, with category
  overrides taking precedence; null thresholds skip) so it unit-tests without a
  DB. DB wrappers (`checkPortfolioAppetite`, `checkSingleRiskAppetite`) load
  config + risks (ALE via the RQ-1 `resolveALE`) and call it. `recordBreaches`
  is idempotent (no duplicate unresolved breach); `resolveStaleBreaches` closes
  breaches no longer active. `getAppetiteStatus` drives a within/approaching
  (>80%)/breached badge.
- **`risk-appetite-monitor`** — daily cross-tenant cron: per tenant with a
  config, scan → record → resolve.
- **Routes** — `risk-appetite` (GET config+status, PUT upsert) +
  `risk-appetite/breaches` (GET history, POST acknowledge).
- **UI** — `admin/risk-appetite` config page (thresholds + statement + cadence +
  live status badge + breach history with acknowledge) + an admin-landing pill.

## Decisions

- **Pure-core + DB-wrapper split** so detection is unit-testable.
- **Advisory, not preventive** — breaches surface as status/history, never block
  a risk save (per the roadmap).
- **Lives under `admin/`** (matching `admin/risk-matrix`), not the roadmap's
  `settings/` path (no settings dir exists).

## Files

| File | Role |
| --- | --- |
| `prisma/schema/{compliance,auth}.prisma` + migration | two models + relations. |
| `usecases/risk-appetite.ts` | pure detection + CRUD + persistence + status. |
| `jobs/risk-appetite-jobs.ts` (+ registry/schedules/types) | daily monitor. |
| `api/t/[slug]/risk-appetite/**` | config + breaches routes. |
| `admin/risk-appetite/page.tsx` + `admin/page.tsx` | config UI + pill. |

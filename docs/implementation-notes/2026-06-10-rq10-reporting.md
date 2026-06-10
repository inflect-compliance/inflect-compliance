# 2026-06-10 — RQ-10 Executive risk reporting & BIA (capstone)

**Commit:** `<sha>` feat(risk): executive risk reporting & BIA (RQ-10)

The capstone — board-ready, data-driven reports that pull from every
risk-quantification surface (RQ-1…RQ-9), plus Business Impact Analysis fields.

## Design

- **Schema** — BIA fields on `Risk` (rtoHours/rpoHours/mtpdHours/biaImpactJson/
  affectedProcesses/revenueAtRisk, nullable) + `ReportTemplate` / `ReportRun`
  (lifecycle: QUEUED→GENERATING→COMPLETED/FAILED) / `ReportSchedule` + RLS +
  migration.
- **`assembleReportData`** pulls portfolio totals (RQ-1 `resolveALE`), top-10
  risks, latest Monte Carlo VaR (RQ-3), appetite status (RQ-2), and BIA
  aggregates into one `ReportData`.
- **Renderers** — `renderCsv` (pure, deterministic) + `renderPdf` (branded
  `src/lib/pdf` pipeline: cover + KPI summary + top-risks table → Buffer).
  **PPTX is a documented follow-up** (no pptxgenjs dependency yet).
- **`generateReport`** — creates a ReportRun, assembles → renders → stores via
  the file provider → COMPLETED (or FAILED with the error). Template CRUD
  (3 system templates lazily seeded), report list/get, schedule CRUD with a pure
  `computeNextRun` cadence.
- **`report-delivery` cron** — daily 06:00 UTC, cross-tenant: generate due
  schedules + advance `nextRunAt` (email/SharePoint delivery is a logged
  follow-up).
- **Routes** — `risks/reports` (GET templates+runs, POST generate),
  `[reportId]/download`, `reports/schedules` (+ `[scheduleId]`). **UI** — reports
  page: templates → Generate PDF/CSV, recent runs → Download.

## Decisions

- **PDF + CSV only** this cycle — PPTX would add `pptxgenjs` (a heavy dep +
  Trivy/audit surface); deferred with the API shape ready.
- **Tests use local fs storage** (`STORAGE_PROVIDER=local` in jest.setup) — the
  default is s3, which needs a bucket; reports are the first usecase to write
  files in an integration test.
- **Lazy template seeding** in `listTemplates` (idempotent) rather than a global
  fixture — keeps system templates per-tenant + RLS-clean.

## Files

| File | Role |
| --- | --- |
| `reports/risk-report-render.ts` | CSV + PDF renderers. |
| `usecases/risk-report.ts` | assemble + generate + template/schedule CRUD. |
| `jobs/report-delivery-jobs.ts` (+ registry/schedules/types) | delivery cron. |
| `prisma/schema/{compliance,auth}.prisma` + migration | BIA + 3 models + RLS. |
| `api/t/[slug]/risks/reports/**` | generate / download / schedules. |
| `risks/reports/page.tsx` | reports UI. |

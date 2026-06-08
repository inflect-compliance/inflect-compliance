# 2026-06-08 — Automation Epics 8–10: Templates, Analytics, Live Monitor

**Commit:** `<sha>` feat(automation): Epics 8-10 — template library, analytics, live monitor

The closing arc of the Workflow Automation roadmap. Adds the Process page's
Templates entry point and its Analytics + Monitor tabs.

## Epic 8 — Template Library
- `src/data/automation-templates/` — 8 typed starter templates (TS, not YAML:
  Next-bundle-safe, no runtime fs, compile-checked, every template validated
  importable by the rule schema in a test).
- `GET/POST /automation/templates` — list + import-as-DRAFT (via the create
  usecase, so policy + audit run). `TemplateLibraryModal` (tag-filterable
  grid) opened from a "Templates" button in the Rules toolbar.

## Epic 9 — Analytics Dashboard
- `getAutomationAnalytics` aggregates rule counts, a daily executions series,
  top-fired rules, SLA breaches, avg duration, error rate over a window
  (bounded fetch + in-JS bucketing; `truncated` flag guards the cap).
- `GET /automation/analytics` + `AnalyticsTab` (KPI tiles + executions
  sparkline + top-rules list + window selector + empty state) — the 3rd tab.

## Epic 10 — Live Monitor & Manual Trigger
- `listLiveExecutions` (RUNNING + recent feed), `cancelExecution` (operator
  interrupt → SKIPPED), `dryRunRule` (evaluate the filter WITHOUT firing).
- `GET /automation/executions/live`, `PATCH /automation/executions/[id]`
  (cancel), `POST /automation/rules/[id]/dry-run`.
- `MonitorTab` (5s SWR refresh, in-flight + cancel + recent feed) +
  `ManualTriggerPanel` (rule picker → Dry run / Fire) — the 4th tab.

## Decisions

- **TS templates over YAML.** Same content packs, but typed + bundle-safe +
  test-validated against the rule schema. The framework-fixture YAML system
  reads at build/seed time; a client-reachable template loader is better as
  data.
- **Analytics bucket in JS over a bounded fetch**, not a raw `date_trunc`
  query — analytics windows are small, and the `truncated` flag prevents a
  silent under-count if a window ever exceeds the cap.
- **Dry run reuses `matchesFilter`** server-side and never writes — the
  console can test a rule's targeting safely; Fire reuses the Epic-6 targeted
  re-trigger.
- **Window/tag selectors are plain buttons**, not `DateRangePicker`/`TabSelect`
  — keeps the tabs ratchet-clean and avoids over-building; a richer range
  picker is a follow-up.
- **The Process page now hosts 4 tabs** (Canvas | Rules | Analytics | Monitor)
  via the canonical EntityDetailLayout tablist pattern (not `TabSelect`).

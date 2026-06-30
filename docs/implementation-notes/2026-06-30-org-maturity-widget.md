# 2026-06-30 — Org Security-Maturity widget: engine-integration lock + metric disambiguation

**Commit:** `<sha> feat(org-dashboard): Security Maturity engine-widget lock + metric consistency`

## Honest starting point (premise correction)

The driving prompt assumed Security Maturity was a **bolt-on** rendered
outside the Epic-41 widget engine (claiming `OrgDashboardWidgetType` had
no `MATURITY` member and the dispatcher had no maturity arm). That was
**stale**. As of this PR the maturity widget was already a first-class
engine widget:

- `ORG_MATURITY` is a member of `OrgDashboardWidgetType` (`enums.prisma`).
- `widget-dispatcher.tsx` has an `ORG_MATURITY` arm that renders
  `<OrgMaturityWidget>` through the engine; `page.tsx` only fetches the
  data and threads it through `PortfolioData` — there is **no** page-level
  bolt-on render.
- It is in `DEFAULT_ORG_DASHBOARD_PRESET` (next to the trend band) and
  addable from the `WidgetPicker`.
- It carries a canonical title via `WIDGET_TITLES`
  (`ORG_MATURITY/radar → "Security Maturity"`).
- `assertWidgetTypedShape` validates a strict `{ view, showCoverageHint }`
  config.
- `OrgMaturityWidget` renders via the Epic-59 `RadarChart` primitive
  inside a guaranteed-height container (`min-h-[260px] flex-1`) with a
  real empty state for a no-rating org ("Rate your maturity to populate
  this radar"). The deployed "blank radar" was a stale-image artefact —
  already fixed in code (see `2026-06-30-dashboard-chart-rendering.md`).

So the migration work the prompt described was already shipped. This PR
does the two things that were **genuinely** open: the metric
disambiguation, and a structural ratchet that locks the integration so it
can't silently regress to a bolt-on.

## The genuine bug: ambiguous tenant-health labels

The screenshot's apparent contradiction — donut "5 Active / Critical (5)"
vs drill-down "Critical Risks: 2" — was **not** a single number rendered
inconsistently. They are two different metrics that happened to share the
word "Critical":

- **"Critical Risks"** = `summary.risks.critical`, surfaced identically by
  the KPI tile (`widget-dispatcher.tsx`) and the drill-down card
  (`dashboard-sections.tsx`). Already single-sourced and consistent.
- The donut's **"Critical"** band = `summary.rag.red` — tenants in red RAG
  **health**, a different count. Its center read a bare **"Active"** (count
  of snapshotted tenants), which compounded the confusion.

Fix: relabel the donut's tenant-health bands so they cannot be read as the
risk metric — `"Critical"` → `"Critical health"`, center `"Active"` →
`"Tenants"`. The donut is now unambiguously about tenant health.

## The single-source-per-metric rule

A metric that means "critical risks" must be **one field**
(`summary.risks.critical`), bound identically everywhere it appears, and
never share a label with a *different* number. The new guardrail enforces
both halves: the KPI + drill-down both bind to `summary.risks.critical`,
and the donut's red-RAG band is NOT labelled like the risk metric.

## Files

| File | Role |
|---|---|
| `src/app/org/[orgSlug]/(app)/widget-dispatcher.tsx` | Donut tenant-health bands disambiguated (`Critical health`, center `Tenants`). |
| `tests/guardrails/org-maturity-widget-integration.test.ts` | Ratchet: ORG_MATURITY in enum/dispatcher/preset/picker/title/strict-config + radar-via-primitive + empty state + critical-risks single-source + donut not conflated. |
| `tests/rendered/portfolio-dashboard-dispatcher.test.tsx` | Donut band label updated; behavioural "critical risks is one number across KPI + drill-down" test added. |

## Decisions

- **Did NOT route `OrgMaturityWidget` through `ChartRenderer`.** The prompt
  suggested it, but the widget is a **composite** (KPI header + radar + CTA
  + advisory hints + rate sheet), not a single chart. `ChartRenderer`
  renders one chart; forcing the composite through it would be wrong. The
  radar already has its own hardened guaranteed-height container + empty
  state, so it inherits the sizing guarantee without the indirection.
- **Kept `showCoverageHint`, did not rename to `showRationale`.** The
  prompt's `{ view, showRationale }` shape was speculative; the shipped
  config is `{ view, showCoverageHint }` and is wired end-to-end (schema +
  picker + widget). Renaming would be churn with a migration cost for zero
  behaviour change.
- **Disambiguation over renumbering.** "Critical Risks" was already
  consistent; the only correct fix was labelling the *other* (tenant-health)
  metric so the two can't be confused — not changing any number.

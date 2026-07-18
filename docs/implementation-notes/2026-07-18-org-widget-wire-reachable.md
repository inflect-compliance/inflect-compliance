# 2026-07-18 — Org widget system: wire the reachable, prune the dead

**Commit:** `<sha>` feat(org-widgets): wire reachable capabilities, prune dead weight

## Design

The org dashboard's add→persist→render loop closed, but several
fully-built capabilities were unreachable. Six remediations wired the
ones that matter and pruned the dead ends.

1. **Target lines — WIRED.** Schema (`TrendConfigSchema.target`),
   `ChartRenderer` (`<TargetLine>` on the area arm), and the
   `TargetLine` component all existed; only the dispatcher forward and
   the picker input were missing. `resolveTrendContent` now forwards
   `config.target` (and `config.colorClassName`, which was also
   ignored); the `WidgetPicker` gained a TREND target block (value +
   optional label + polarity).

2. **Post-create edit — ADDED.** The PATCH route + `updateOrgDashboardWidget`
   already supported title/chartType/config; only the client sent just
   position/size. The `WidgetPicker` gained an `editWidget` prop (hydrates
   the form from the row, locks the immutable type) + `onUpdate`;
   `PortfolioDashboard` gained a per-widget edit (gear) trigger and a
   `handleUpdate` that PATCHes and reflects the response.

3. **KPI trend indicator — WIRED.** `resolveKpiContent` supplied
   `trendPolarity` but never `previousValue`/`sparkline`, so the ▲/▼
   arrow could never render. New `resolveKpiTrend` derives both from the
   portfolio trend series (coverage → `controlCoveragePercent`,
   critical-risks → `risksCritical`, overdue-evidence → `evidenceOverdue`;
   `tenants` has no per-period baseline, so it stays arrow-less).

4. **Tenant "cards" view — DELETED.** `display:'cards'` was unreachable
   (absent from the schema + picker; the dispatcher never passed the
   per-tenant `trends`). Wiring the sparkline would need a new
   per-(date,tenant) snapshot query + full plumbing for one optional
   layout that merely duplicates `TenantCoverageList`. Pruned:
   `TenantCoverageCards` + the dispatcher branch + the orphaned
   `MiniAreaChart`/`CardList`/`TimestampTooltip` imports.

5. **Dead chart shapes — REMOVED.** The dispatcher only ever emits
   `kpi`/`donut`/`area`; `gauge`/`sparkline`/`line`/`bar` were
   unreachable renderer arms + `ChartType` members. `ChartType` is now
   `'kpi' | 'donut' | 'area'`; the dead arms, configs, payloads, and the
   unused `isTimeSeriesChartType` guard were removed.

6. **Cleanup.** Removed the orphaned `ChartContentSurface` export;
   documented that "preset" is intentionally one canonical default +
   reset (not a multi-preset save/apply engine); surfaced the omitted
   config knobs in the picker (DONUT `maxSegments`, TENANT_LIST `limit`,
   ORG_INITIATIVES `statusFilter`).

## Files

| File | Role |
| --- | --- |
| `src/app/org/[orgSlug]/(app)/widget-dispatcher.tsx` | Forward target/colorClassName; `resolveKpiTrend` (previousValue+sparkline); drop cards branch |
| `src/components/ui/dashboard-widgets/WidgetPicker.tsx` | Edit mode + target input + maxSegments/limit/statusFilter knobs |
| `src/app/org/[orgSlug]/(app)/PortfolioDashboard.tsx` | Edit trigger + `handleUpdate` + widened `patchWidget` |
| `src/components/ui/dashboard-widgets/types.ts` | `ChartType` = kpi/donut/area; dead configs removed |
| `src/components/ui/dashboard-widgets/ChartRenderer.tsx` | Dead arms + `ChartContentSurface` removed |
| `src/app/org/[orgSlug]/(app)/dashboard-sections.tsx` | `TenantCoverageCards` deleted |
| `src/app-layer/usecases/org-dashboard-presets.ts` | "single default, not multi-preset" note |

## Decisions

- **Wire vs prune, per capability.** Target lines, edit, and KPI trends
  were cheap to wire (all backing layers existed) → wired. The tenant
  cards view and the four dead chart shapes had no data source / no
  emit path and only duplicated existing surfaces → pruned, so
  `ChartType` and the section exports reflect what's actually
  producible.
- **KpiCard stays lean.** The KPI trend uses `KpiCard`'s existing
  `previousValue`/`sparkline` props (supplied by the dispatcher) — no
  change to the shared primitive.
- **Type is immutable in edit.** The picker locks the widget type in
  edit mode (changing it is delete + recreate) — matching the schema's
  `UpdateOrgDashboardWidgetInput`, which omits `type`.

/**
 * Epic 41 — dashboard-widgets barrel.
 *
 * Public surface for the configurable dashboard widget rendering
 * layer. Consumers import from `@/components/ui/dashboard-widgets`
 * rather than the per-file paths below — the layout under this
 * directory is an implementation detail.
 *
 * Exports:
 *
 *   - `<ChartRenderer>`     — typed dispatcher for the supported
 *                             chart shapes (kpi / donut / area).
 *   - `<DashboardWidget>`   — generic widget shell (header, actions,
 *                             resize handle, content slot).
 *   - Types                 — `ChartType`, `ChartRenderState`,
 *                             `ChartRendererProps`,
 *                             `DashboardWidgetProps`.
 */

export { ChartRenderer } from './ChartRenderer';
export type { ChartRendererProps } from './ChartRenderer';
export {
    DashboardWidget,
    type DashboardWidgetProps,
} from './DashboardWidget';
export {
    DashboardGrid,
    type DashboardGridProps,
    type DashboardGridWidget,
    type WidgetLayoutChange,
} from './DashboardGrid';
export {
    WidgetPicker,
    type WidgetPickerProps,
} from './WidgetPicker';
export type {
    ChartType,
    ChartRenderState,
    KpiConfig,
    DonutConfig,
    DonutSegmentInput,
    TimeSeriesConfig,
    ChartTargetConfig,
} from './types';
export { TargetLine, type TargetLineProps } from './TargetLine';

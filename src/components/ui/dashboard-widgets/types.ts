/**
 * Epic 41 — dashboard widget rendering layer types.
 *
 * The renderer below is intentionally decoupled from the backend
 * `OrgDashboardWidgetType` enum. Backend rows store a (widgetType,
 * chartType, config) trio that's persisted-shape vocabulary; the
 * renderer takes a frontend `ChartType` that's visualization-shape
 * vocabulary. The mapping happens at the page / dispatcher layer
 * (later prompts) — this file is the rendering primitive's contract,
 * uncoupled from any single dashboard's wiring.
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { MiniAreaChartVariant } from '@/components/ui/mini-area-chart';
import type { KpiFormat } from '@/components/ui/KpiCard';
import type { TrendPolarity } from '@/lib/kpi-trend';

/**
 * The set of visualization shapes the renderer understands — and,
 * deliberately, ONLY the shapes the org widget dispatcher actually
 * produces. The `gauge` / `sparkline` / `line` / `bar` arms that once
 * lived here were unreachable (no dispatcher path emitted them), so
 * they were removed to keep this union honest. Add a new shape only
 * alongside a dispatcher path + picker option that emits it.
 *
 *   - `kpi`    single number with label / sparkline / delta
 *   - `donut`  percent-share donut
 *   - `area`   time-series filled area (optionally with a target line)
 */
export type ChartType = 'kpi' | 'donut' | 'area';

/**
 * Render lifecycle envelope. Mirrors the chart-platform's
 * `chartReady / Loading / Empty / Error` state constructors so the
 * renderer can drop straight in alongside any existing platform
 * consumer.
 */
export type ChartRenderState = 'loading' | 'empty' | 'error' | 'ready';

// ─── Per-shape config ───────────────────────────────────────────────

export interface KpiConfig {
    label: string;
    value: number | null | undefined;
    format?: KpiFormat;
    /** Tailwind gradient classes for the headline value. */
    gradient?: string;
    icon?: LucideIcon;
    subtitle?: string;
    delta?: number | null;
    deltaLabel?: string;
    /**
     * Previous-period value for the auto-computed trend path. See
     * `KpiCard` and `computeKpiTrend` for the full contract.
     */
    previousValue?: number | null;
    /**
     * Polarity of the metric for good/bad colouring. See
     * `TrendPolarity` for the values + meaning.
     */
    trendPolarity?: TrendPolarity;
    /** Optional sparkline below the value. */
    sparkline?: ReadonlyArray<{ date: Date; value: number }>;
    sparklineVariant?: MiniAreaChartVariant;
}

/**
 * Optional target-line overlay on time-series charts. Renders a
 * dashed reference line at `value` on the y-axis with a label
 * anchored to the right edge of the plot.
 */
export interface ChartTargetConfig {
    value: number;
    label?: string;
    /**
     * Reserved for future use (label-colour polarity). The line
     * itself is always token-neutral so a busy chart stays readable.
     */
    polarity?: 'above-good' | 'below-good';
}

export interface DonutSegmentInput {
    label: string;
    value: number;
    color: string;
}

export interface DonutConfig {
    segments: ReadonlyArray<DonutSegmentInput>;
    centerLabel?: string;
    centerSub?: string;
    showLegend?: boolean;
    /** Diameter in px. Defaults to a chart-platform-aligned 160. */
    size?: number;
}

export interface TimeSeriesConfig {
    points: ReadonlyArray<{ date: Date; value: number }>;
    /** Stable id for the series; defaults to "series". */
    seriesId?: string;
    /** Token-backed colour class (e.g. `text-content-success`). */
    seriesColorClassName?: string;
    /** Series label rendered in the tooltip. */
    seriesLabel?: string;
    /** Custom empty-state node; falls through to the platform default. */
    emptyState?: ReactNode;
    /**
     * Optional dashed reference line at a specific y-value. Useful
     * for visualising SLAs / targets / thresholds against the
     * series. See `ChartTargetConfig` for shape.
     */
    target?: ChartTargetConfig;
}

// ─── Discriminated payload ──────────────────────────────────────────

interface BaseRenderProps {
    state?: ChartRenderState;
    /** When `state === 'error'`, an error message rendered inline. */
    error?: string;
    className?: string;
    /** Accessible label for the rendered visualization. */
    'aria-label'?: string;
}

interface KpiPayload extends BaseRenderProps {
    chartType: 'kpi';
    config: KpiConfig;
}

interface DonutPayload extends BaseRenderProps {
    chartType: 'donut';
    config: DonutConfig;
}

interface TimeSeriesPayload extends BaseRenderProps {
    chartType: 'area';
    config: TimeSeriesConfig;
}

export type ChartRendererProps =
    | KpiPayload
    | DonutPayload
    | TimeSeriesPayload;

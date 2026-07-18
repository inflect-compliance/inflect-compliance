/**
 * Epic 41 — `<ChartRenderer>` + `<DashboardWidget>` rendered tests.
 *
 * Coverage:
 *   - per-shape happy path (kpi / donut / area) renders the right
 *     primitive
 *   - lifecycle states (loading / empty / error) replace the body
 *   - malformed config falls back to the empty state without throwing
 *   - DashboardWidget header / actions / resize-handle visibility
 *
 * Charts that depend on a measured ParentSize (TimeSeriesChart,
 * MiniAreaChart) are tested via `data-chart-*` markers + the test-id
 * surface their underlying components emit; we don't assert SVG
 * dimensions because jsdom's layout engine reports 0×0 for ParentSize
 * and the chart short-circuits.
 */

import { render, screen } from '@testing-library/react';
import * as React from 'react';

import {
    ChartRenderer,
    DashboardWidget,
} from '@/components/ui/dashboard-widgets';

// ─── ChartRenderer — happy paths ────────────────────────────────────

describe('Epic 41 — ChartRenderer per shape', () => {
    it('kpi shape renders the headline label + formatted value', () => {
        render(
            <ChartRenderer
                chartType="kpi"
                config={{
                    label: 'Coverage',
                    value: 75.3,
                    format: 'percent',
                    subtitle: '15 of 20 implemented',
                }}
            />,
        );
        expect(screen.getByText('Coverage')).toBeInTheDocument();
        expect(screen.getByText('75.3%')).toBeInTheDocument();
        expect(screen.getByText('15 of 20 implemented')).toBeInTheDocument();
    });

    it('kpi shape with null value renders the empty dash', () => {
        render(
            <ChartRenderer
                chartType="kpi"
                config={{ label: 'Coverage', value: null, format: 'percent' }}
            />,
        );
        expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('donut shape renders the legend labels and segment count', () => {
        render(
            <ChartRenderer
                chartType="donut"
                config={{
                    segments: [
                        { label: 'Healthy', value: 4, color: '#10b981' },
                        { label: 'At risk', value: 2, color: '#f59e0b' },
                        { label: 'Critical', value: 1, color: '#ef4444' },
                    ],
                    centerLabel: '7',
                    centerSub: 'Active',
                    showLegend: true,
                }}
            />,
        );
        expect(screen.getByText('Healthy')).toBeInTheDocument();
        expect(screen.getByText('At risk')).toBeInTheDocument();
        expect(screen.getByText('Critical')).toBeInTheDocument();
        expect(screen.getByText('7')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('donut with empty segments falls back to the inline empty state', () => {
        render(
            <ChartRenderer chartType="donut" config={{ segments: [] }} />,
        );
        // The renderer's malformed-config guard surfaces a
        // `data-chart-empty` element rather than crashing.
        const empty = document.querySelector('[data-chart-empty]');
        expect(empty).not.toBeNull();
    });

    it('area shape renders a TimeSeriesChart-style ParentSize wrapper', () => {
        const points = [
            { date: new Date('2026-04-01'), value: 1 },
            { date: new Date('2026-04-02'), value: 2 },
        ];
        const { container } = render(
            <ChartRenderer chartType="area" config={{ points }} />,
        );
        // jsdom reports 0×0 for ParentSize → the platform
        // short-circuits to null. The wrapper still emits a
        // non-empty container, so we verify it rendered without
        // throwing.
        expect(container.firstChild).not.toBeNull();
    });
});

// ─── ChartRenderer — lifecycle states ──────────────────────────────

describe('Epic 41 — ChartRenderer lifecycle', () => {
    it('state="loading" shows a busy skeleton', () => {
        render(
            <ChartRenderer
                chartType="donut"
                state="loading"
                config={{ segments: [] }}
                aria-label="Loading distribution"
            />,
        );
        expect(
            document.querySelector('[data-chart-loading]'),
        ).not.toBeNull();
    });

    it('state="error" surfaces the provided error text', () => {
        render(
            <ChartRenderer
                chartType="donut"
                state="error"
                error="Failed to fetch RAG data"
                config={{ segments: [] }}
            />,
        );
        expect(
            screen.getByText('Failed to fetch RAG data'),
        ).toBeInTheDocument();
        expect(
            document.querySelector('[data-chart-error]'),
        ).not.toBeNull();
    });

    it('state="empty" replaces the chart with the inline empty state for non-KPI shapes', () => {
        render(
            <ChartRenderer
                chartType="donut"
                state="empty"
                config={{
                    segments: [
                        { label: 'Healthy', value: 1, color: '#10b981' },
                    ],
                }}
            />,
        );
        // Even though the segments array is non-empty, the explicit
        // `state="empty"` short-circuits to the inline empty state.
        expect(
            document.querySelector('[data-chart-empty]'),
        ).not.toBeNull();
        expect(screen.queryByText('Healthy')).toBeNull();
    });

    it('state="empty" on a KPI lets the KpiCard own its dim placeholder', () => {
        // KPI's own empty path is "—" with `text-content-subtle`,
        // which is softer than the platform inline empty state.
        // Confirm the renderer does NOT short-circuit for KPI.
        render(
            <ChartRenderer
                chartType="kpi"
                state="empty"
                config={{ label: 'Coverage', value: 75.3 }}
            />,
        );
        // The KPI value still renders — empty state is the KPI's
        // own visual contract, not the renderer's.
        expect(screen.getByText('Coverage')).toBeInTheDocument();
    });
});

// ─── DashboardWidget wrapper ────────────────────────────────────────

describe('Epic 41 — DashboardWidget wrapper', () => {
    it('renders the title + subtitle in the header row', () => {
        render(
            <DashboardWidget title="Coverage" subtitle="org-wide">
                <div>body</div>
            </DashboardWidget>,
        );
        expect(screen.getByText('Coverage')).toBeInTheDocument();
        expect(screen.getByText('org-wide')).toBeInTheDocument();
    });

    it('exposes a region landmark when title is set', () => {
        render(
            <DashboardWidget title="Coverage">
                <div>body</div>
            </DashboardWidget>,
        );
        const region = screen.getByRole('region', { name: 'Coverage' });
        expect(region).toBeInTheDocument();
    });

    it('renders an actions slot when provided', () => {
        render(
            <DashboardWidget
                title="Coverage"
                actions={
                    <button type="button" data-testid="config-trigger">
                        Configure
                    </button>
                }
            >
                <div>body</div>
            </DashboardWidget>,
        );
        expect(screen.getByTestId('config-trigger')).toBeInTheDocument();
        // Actions are inside the dedicated header slot.
        const actionsHost = document.querySelector(
            '[data-widget-actions]',
        );
        expect(actionsHost).not.toBeNull();
        expect(actionsHost?.contains(screen.getByTestId('config-trigger'))).toBe(true);
    });

    it('renders the resize handle by default and hides it on opt-out', () => {
        const { rerender } = render(
            <DashboardWidget title="Coverage">
                <div>body</div>
            </DashboardWidget>,
        );
        expect(
            document.querySelector('[data-widget-resize-handle]'),
        ).not.toBeNull();

        rerender(
            <DashboardWidget title="Coverage" showResizeHandle={false}>
                <div>body</div>
            </DashboardWidget>,
        );
        expect(
            document.querySelector('[data-widget-resize-handle]'),
        ).toBeNull();
    });

    it('skips the header entirely when no title / subtitle / actions are set', () => {
        render(
            <DashboardWidget>
                <div>body</div>
            </DashboardWidget>,
        );
        expect(
            document.querySelector('[data-widget-header]'),
        ).toBeNull();
    });

    it('forwards a stable widget id to data-widget-id', () => {
        render(
            <DashboardWidget data-widget-id="w-123">
                <div>body</div>
            </DashboardWidget>,
        );
        expect(
            document.querySelector('[data-widget-id="w-123"]'),
        ).not.toBeNull();
    });

    it('hosts a ChartRenderer end-to-end', () => {
        render(
            <DashboardWidget title="Coverage">
                <ChartRenderer
                    chartType="kpi"
                    config={{
                        label: 'Coverage',
                        value: 75.3,
                        format: 'percent',
                    }}
                />
            </DashboardWidget>,
        );
        // Both the wrapper title and the KPI label render.
        expect(
            screen.getAllByText('Coverage'),
        ).toHaveLength(2);
        expect(screen.getByText('75.3%')).toBeInTheDocument();
    });
});

// ─── Renderer coupling guard ───────────────────────────────────────

describe('Epic 41 — renderer ↔ wrapper coupling', () => {
    it('renderer + wrapper compose without leaking layout boundaries', () => {
        // The wrapper sets `flex flex-col` + `min-h-0` on the body
        // so the chart's ParentSize can measure correctly. Render
        // an area chart inside the wrapper and confirm no error.
        const points = Array.from({ length: 5 }, (_, i) => ({
            date: new Date(2026, 3, i + 1),
            value: 60 + i * 2,
        }));
        const { container } = render(
            <DashboardWidget title="Trend">
                <ChartRenderer
                    chartType="area"
                    config={{ points, seriesId: 'coverage' }}
                    aria-label="Coverage trend"
                />
            </DashboardWidget>,
        );
        expect(container.firstChild).not.toBeNull();
    });
});

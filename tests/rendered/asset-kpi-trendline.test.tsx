/**
 * Asset KPI trendlines: the 4 asset KPI tiles render an inline sparkline.
 *
 * The series now comes from the daily compliance-snapshot table (one frozen
 * point per 24h) via getComplianceTrends — see DashboardRepository.getAssetSummary
 * + the snapshot job. The KpiFilterCard sparkline wiring below is the
 * presentational contract (renders the chart when given ≥2 points), unchanged
 * by the data-source swap. The per-day series shape is covered server-side in
 * the compliance-trends + snapshot unit tests.
 */
import { render } from '@testing-library/react';
import * as React from 'react';
import type { TimeSeriesPoint } from '@/components/ui/charts';
import { KpiFilterCard } from '@/components/ui/kpi-filter-card';

describe('KpiFilterCard sparkline', () => {
    const spark: TimeSeriesPoint[] = [
        { date: new Date('2026-01-01'), value: 1 },
        { date: new Date('2026-02-01'), value: 2 },
        { date: new Date('2026-03-01'), value: 3 },
    ];

    // MiniAreaChart's <ParentSize> renders its wrapper div (with the
    // passed className) but returns null inside at 0×0 (jsdom has no
    // layout), so we assert the wrapper, not the svg.
    // B2 (2026-06-07): the wrapper is to the RIGHT of the value, spanning the
    // right TWO-THIRDS (h-8 w-2/3). Windows-alignment follow-up: the wrapper
    // is now ABSOLUTELY positioned (bottom-right, out of flow) so its
    // vertical level can't depend on the label/value text height — the cause
    // of the per-OS misalignment. It keeps the h-8 w-2/3 size.
    const sparkWrapper = (c: HTMLElement) =>
        c.querySelector('.h-8[class*="w-2/3"]');

    it('renders the sparkline wrapper when given ≥2 points', () => {
        const { container } = render(<KpiFilterCard label="Total assets" value={3} sparkline={spark} />);
        expect(sparkWrapper(container)).not.toBeNull();
    });

    it('pins the sparkline out of flow (absolute bottom-right) so its level is text-height-independent', () => {
        const { container } = render(<KpiFilterCard label="Total assets" value={3} sparkline={spark} />);
        const wrapper = sparkWrapper(container);
        expect(wrapper).not.toBeNull();
        // Out of flow + bottom-right anchored: position no longer derives
        // from the value/label box height (the OS-font-dependent variable).
        expect(wrapper!.className).toMatch(/absolute/);
        expect(wrapper!.className).toMatch(/bottom-0/);
        expect(wrapper!.className).toMatch(/right-0/);
        // It must not steal clicks from the card button.
        expect(wrapper!.className).toMatch(/pointer-events-none/);
        // The old below-the-value stacked wrapper is gone.
        expect(container.querySelector('.mt-3.h-8.w-full')).toBeNull();
    });

    it('keeps the label on a single line (full-width KPIStat, not squeezed by the sparkline)', () => {
        // The label sits in a full-width <KPIStat>, NOT crammed into the
        // third left of an in-flow flex row beside a w-2/3 sparkline — so it
        // can't wrap to a different line-count per OS and shift the card
        // height. The sparkline wrapper is a sibling of KPIStat, not nested
        // inside its flex row.
        const { container } = render(<KpiFilterCard label="High criticality" value={3} sparkline={spark} />);
        const wrapper = sparkWrapper(container)!;
        expect(wrapper.closest('.flex.items-end')).toBeNull();
    });

    it('renders no sparkline without data', () => {
        const { container } = render(<KpiFilterCard label="Total assets" value={3} />);
        expect(sparkWrapper(container)).toBeNull();
    });

    it('renders no sparkline with fewer than 2 points', () => {
        const { container } = render(
            <KpiFilterCard label="Total assets" value={1} sparkline={[{ date: new Date('2026-01-01'), value: 1 }]} />,
        );
        expect(sparkWrapper(container)).toBeNull();
    });
});

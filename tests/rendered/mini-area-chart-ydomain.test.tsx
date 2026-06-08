/**
 * MiniAreaChart shared y-domain — the fix for "all asset KPI sparklines look
 * the same". Without a shared domain each series auto-fits its own range, so
 * absolute magnitude (and flat series at different values) collapse to the same
 * shape. A shared `[0, max]` domain keeps them comparable.
 */
import { resolveYDomain } from '@/components/ui/mini-area-chart';
import { render } from '@testing-library/react';
import * as React from 'react';
import { KpiFilterCard } from '@/components/ui/kpi-filter-card';
import type { TimeSeriesPoint } from '@/components/ui/charts';

describe('resolveYDomain', () => {
    it('auto-fits the series own [min,max] with no override', () => {
        expect(resolveYDomain([2, 5, 9])).toEqual([2, 9]);
    });

    it('expands a constant series to a synthetic range (centred flat line)', () => {
        // THE BUG: every flat series — regardless of value — gets the same
        // ±1 range, so they all render as the same centred horizontal line.
        expect(resolveYDomain([2, 2, 2])).toEqual([1, 3]);
        expect(resolveYDomain([90, 90, 90])).toEqual([89, 91]);
        // ^ both ranges are width-2 centred on the value → identical shape.
    });

    it('an explicit shared domain wins — flat series sit at DIFFERENT heights', () => {
        // THE FIX: a shared [0, 90] domain. A flat-at-2 and a flat-at-90 series
        // now map to different y-positions (2/90 vs 90/90 of the height).
        expect(resolveYDomain([2, 2, 2], [0, 90])).toEqual([0, 90]);
        expect(resolveYDomain([90, 90, 90], [0, 90])).toEqual([0, 90]);
        // same domain → the line height is driven purely by the value, so the
        // two cards are visually distinct.
    });
});

describe('KpiFilterCard passes the shared domain through', () => {
    const spark: TimeSeriesPoint[] = [
        { date: new Date('2026-01-01'), value: 2 },
        { date: new Date('2026-02-01'), value: 2 },
    ];
    it('accepts sparklineDomain without crashing (wiring smoke test)', () => {
        const { container } = render(
            <KpiFilterCard label="Retired" value={2} sparkline={spark} sparklineDomain={[0, 90]} />,
        );
        expect(container.querySelector('.h-8[class*="w-2/3"]')).not.toBeNull();
    });
});

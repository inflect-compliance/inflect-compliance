/**
 * RQ2-6 — `<LossExceedanceCurve>` appetite reference lines.
 *
 * Locks: zero-cost default (no lines prop → no marker nodes), the
 * dashed marker + label render per line, and the x-domain stretches
 * to keep an off-chart cap visible.
 */

import { render, screen } from '@testing-library/react';
import * as React from 'react';

import { LossExceedanceCurve } from '@/components/ui/charts/loss-exceedance-curve';

// ParentSize measures 0×0 in jsdom — pin a real size so the inner
// SVG renders.
jest.mock('@visx/responsive', () => ({
    ParentSize: ({ children }: { children: (s: { width: number }) => React.ReactNode }) =>
        children({ width: 600 }),
}));

const POINTS = [
    { threshold: 1_000_000, exceedanceCount: 1, exceedanceFraction: 0.25 },
    { threshold: 500_000, exceedanceCount: 2, exceedanceFraction: 0.5 },
    { threshold: 100_000, exceedanceCount: 3, exceedanceFraction: 0.75 },
    { threshold: 10_000, exceedanceCount: 4, exceedanceFraction: 1 },
];

describe('LossExceedanceCurve — appetite reference lines', () => {
    it('renders no marker nodes without the prop (zero-cost default)', () => {
        render(<LossExceedanceCurve data={POINTS} />);
        expect(screen.queryAllByTestId('lec-reference-line')).toHaveLength(0);
    });

    it('renders a dashed marker + label per reference line', () => {
        render(
            <LossExceedanceCurve
                data={POINTS}
                referenceLines={[{ value: 750_000, label: 'Per-risk appetite' }]}
            />,
        );
        const markers = screen.getAllByTestId('lec-reference-line');
        expect(markers).toHaveLength(1);
        expect(markers[0].querySelector('line')).toHaveAttribute('stroke-dasharray', '4 3');
        expect(markers[0].textContent).toContain('Per-risk appetite ($750k)');
    });

    it('stretches the x-domain so an over-the-max cap stays on canvas', () => {
        render(
            <LossExceedanceCurve
                data={POINTS}
                referenceLines={[{ value: 5_000_000, label: 'Per-risk appetite' }]}
            />,
        );
        const marker = screen.getByTestId('lec-reference-line');
        const line = marker.querySelector('line')!;
        // Plot width = 600 − 56 (left) − 24 (right) = 520. The line
        // must sit INSIDE the plot, not clamped past its right edge.
        expect(parseFloat(line.getAttribute('x1')!)).toBeLessThanOrEqual(520);
        expect(parseFloat(line.getAttribute('x1')!)).toBeGreaterThan(400);
    });
});

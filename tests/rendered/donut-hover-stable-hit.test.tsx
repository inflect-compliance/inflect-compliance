/**
 * DonutChart hover stability — the boundary "tremble" regression guard.
 *
 * Bug: when the cursor sat right between two segments, the sections
 * trembled. Cause — the hover handlers (`onMouseEnter`/`onMouseLeave`)
 * lived on the SAME `<g>` that carries the hover-pop transform. Hovering a
 * segment translated it 4px radially out from under the cursor →
 * `mouseleave` → un-pop → the arc snapped back under the cursor →
 * `mouseenter` → pop … an infinite oscillation.
 *
 * Fix + contract locked here: the geometry that MOVES on hover (the popped
 * visual group) is INERT to the pointer (`pointer-events: none`), and a
 * SEPARATE stable hit path (the resting arc geometry, `pointer-events: all`)
 * owns the hover. The hit target must NEVER live inside the popped group —
 * that decoupling is what stops the tremble.
 */
import { render } from '@testing-library/react';
import * as React from 'react';
import DonutChart, { type DonutSegment } from '@/components/ui/DonutChart';

describe('DonutChart — hover hit-target decoupled from the pop transform', () => {
    const segments: DonutSegment[] = [
        { label: 'Open', value: 10, seriesIndex: 6, color: '#000' },
        { label: 'Mitigating', value: 6, seriesIndex: 5, color: '#111' },
        { label: 'Closed', value: 3, seriesIndex: 3, color: '#222' },
    ];

    it('renders one stable transparent hit path per non-zero segment', () => {
        const { container } = render(
            <DonutChart segments={segments} showLegend={false} />,
        );
        const hits = container.querySelectorAll(
            'path[pointer-events="all"][fill="transparent"]',
        );
        expect(hits.length).toBe(segments.length);
    });

    it('the popped visual layers are inert (pointer-events:none) so the moving geometry never owns the pointer', () => {
        const { container } = render(
            <DonutChart segments={segments} showLegend={false} />,
        );
        const inertGroups = container.querySelectorAll('g[pointer-events="none"]');
        // One inert visual group per segment.
        expect(inertGroups.length).toBe(segments.length);
    });

    it('NO hit target lives inside a popped/inert group (the decoupling that kills the tremble)', () => {
        const { container } = render(
            <DonutChart segments={segments} showLegend={false} />,
        );
        const hits = Array.from(
            container.querySelectorAll('path[pointer-events="all"]'),
        );
        expect(hits.length).toBeGreaterThan(0);
        for (const hit of hits) {
            // The pointer-receiving path must be a SIBLING of the popped
            // group, never a descendant — otherwise it moves with the pop
            // and the oscillation returns.
            expect(hit.closest('g[pointer-events="none"]')).toBeNull();
        }
    });
});

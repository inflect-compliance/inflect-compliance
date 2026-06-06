/**
 * KPI + filter cards are not text-selectable — the headline number/label
 * are filter affordances, not copyable content, so clicking shouldn't
 * highlight them. Locks `select-none` on both card chassis.
 */
import { render } from '@testing-library/react';
import * as React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { KpiFilterCard } from '@/components/ui/kpi-filter-card';
import { MetricCard } from '@/components/ui/MetricCard';

describe('KpiFilterCard is not text-selectable', () => {
    it('static card carries select-none', () => {
        const { container } = render(<KpiFilterCard label="Total" value={1} />);
        expect(container.querySelector('.select-none')).not.toBeNull();
    });
    it('clickable card carries select-none', () => {
        const { container } = render(
            <KpiFilterCard label="Total" value={1} onClick={() => {}} />,
        );
        expect(container.querySelector('.select-none')).not.toBeNull();
    });
});

describe('MetricCard (dashboard KPI chassis) is not text-selectable', () => {
    it('renders with select-none', () => {
        const { container } = render(
            <MetricCard eyebrow="Coverage">75%</MetricCard>,
        );
        expect(container.querySelector('.select-none')).not.toBeNull();
    });
    it('source pins select-none on the chassis', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'src/components/ui/MetricCard.tsx'),
            'utf8',
        );
        expect(src).toMatch(/select-none/);
    });
});

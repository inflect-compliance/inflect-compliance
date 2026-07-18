/**
 * Dashboard donut segment drill-through ratchet.
 *
 * Clicking a pie/donut slice (or its legend row) on the executive
 * dashboard opens the entity list filtered to that slice — Risk
 * Distribution by inherent-score range, Task/Policy Status by status.
 * Locks the wiring so a refactor can't quietly turn the donuts back
 * into display-only charts.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const DONUT = read('src/components/ui/DonutChart.tsx');
const CLIENT = read('src/app/t/[tenantSlug]/(app)/dashboard/DashboardClient.tsx');

describe('DonutChart — clickable slices', () => {
    it('accepts an onSegmentClick handler + a per-segment href', () => {
        expect(DONUT).toMatch(/onSegmentClick\?:\s*\(segment: DonutSegment\) => void/);
        expect(DONUT).toMatch(/href\?:\s*string/);
    });
    it('makes the hit path a keyboard-accessible link when clickable', () => {
        expect(DONUT).toMatch(/onSegmentClick && seg\.href/);
        expect(DONUT).toMatch(/role=\{[\s\S]*?'link'/);
        // Enter/Space activate the slice.
        expect(DONUT).toMatch(/e\.key === 'Enter' \|\|\s*e\.key === ' '/);
    });
});

describe('DashboardClient — donuts drill through to filtered lists', () => {
    it('passes onSegmentClick that navigates to the slice href', () => {
        expect(CLIENT).toMatch(/onSegmentClick=\{\(s\) => s\.href && router\.push\(s\.href\)\}/);
    });
    it('renders a clickable legend row per slice', () => {
        expect(CLIENT).toMatch(/function DonutLegendRow/);
        expect(CLIENT).toMatch(/<DonutLegendRow/);
    });

    it('risk severity slices target the risks score-range filter', () => {
        expect(CLIENT).toMatch(/\/risks\?score=15\|25/); // Critical
        expect(CLIENT).toMatch(/\/risks\?score=10\|14/); // High
        expect(CLIENT).toMatch(/\/risks\?score=5\|9/);   // Medium
        expect(CLIENT).toMatch(/\/risks\?score=1\|4/);   // Low
    });

    it('task + policy slices target their status filters', () => {
        expect(CLIENT).toMatch(/\/tasks\?status=OPEN,TRIAGED/);
        expect(CLIENT).toMatch(/\/tasks\?status=IN_PROGRESS/);
        expect(CLIENT).toMatch(/\/policies\?status=DRAFT/);
        expect(CLIENT).toMatch(/\/policies\?status=PUBLISHED/);
    });
});

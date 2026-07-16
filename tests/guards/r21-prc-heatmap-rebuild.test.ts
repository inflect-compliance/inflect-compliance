/**
 * R21-PR-C — Heatmap rebuild ratchet (RiskHeatmap + CalendarHeatmap).
 *
 * Both heatmaps move onto R21-PR-A's `useHeatScale` + `<ChartLegend
 * variant="gradient">` foundation. Same hook, two heatmaps, one
 * vocabulary.
 *
 * Eight load-bearing invariants this ratchet locks:
 *
 *   RiskHeatmap (5×5 likelihood × impact):
 *     1. Wires useHeatScale with the score domain [1, scale²] and
 *        series 4 (pink — the closest "severity" ramp in R16).
 *     2. Cell backgrounds paint via `heat.colorFor(score)`, not via
 *        the previous bespoke `getCellColor` hex palette.
 *     3. Hover crosshair: hovered cell highlights its row AND
 *        column (the canonical matrix-heatmap affordance).
 *     4. `onSelectCell` callback wires the click-drill — count=0
 *        cells are disabled.
 *     5. Empty-cell muted via opacity 0.4 (still part of the
 *        gradient vocabulary, just at the floor).
 *     6. <ChartLegend variant="gradient"> replaces the 4-swatch
 *        legend.
 *
 *   CalendarHeatmap (GitHub-style):
 *     7. Wires useHeatScale with the activity domain [0, max] and
 *        series 1 (brand warm). Cells paint via heat.colorFor.
 *     8. Month-separator marker — weeks that start a new month
 *        get `data-month-start="true"` + a token-backed 1px left
 *        border.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
// PR-K — the legacy <RiskHeatmap> was deleted (superseded by the
// config-driven <RiskMatrix>); only the CalendarHeatmap half of this
// R21-PR-C ratchet remains.
const CALENDAR = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/CalendarHeatmap.tsx'),
    'utf8',
);

describe('R21-PR-C — Heatmap rebuild on R21-PR-A foundation', () => {
    describe('CalendarHeatmap', () => {
        it('imports useHeatScale + ChartLegend from the charts barrel', () => {
            expect(CALENDAR).toMatch(/from\s+['"]@\/components\/ui\/charts['"]/);
            expect(CALENDAR).toMatch(/useHeatScale/);
            expect(CALENDAR).toMatch(/ChartLegend/);
        });

        it('wires useHeatScale with the activity domain [0, max] + series 1', () => {
            expect(CALENDAR).toMatch(/domain:\s*\[0,\s*Math\.max\(max,\s*1\)\]/);
            expect(CALENDAR).toMatch(/series:\s*1/);
        });

        it('cell background paints via heat.colorFor(count)', () => {
            expect(CALENDAR).toMatch(/background:\s*heat\.colorFor\(count\)/);
        });

        it('the legacy getIntensityTone() bucket lookup is gone', () => {
            const stripped = CALENDAR.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).not.toMatch(/getIntensityTone/);
            expect(stripped).not.toMatch(/bucketIntensity/);
        });

        it('emits month-separator marker via data-month-start + soft border', () => {
            expect(CALENDAR).toMatch(/data-month-start/);
            expect(CALENDAR).toMatch(/weekMonthStart/);
            expect(CALENDAR).toMatch(/border-l border-border-subtle/);
        });

        it('weekMonthStart compares prev/curr week first-non-null months', () => {
            // The boundary detection is per-week: a week starts a
            // new month iff its first non-null day's month differs
            // from the previous week's first non-null day's month.
            // Locks the detection shape so a future "simplify" PR
            // that breaks the prev-week comparison fires.
            expect(CALENDAR).toMatch(
                /firstThisWeek\.getUTCMonth\(\)\s*!==\s*firstPrevWeek\.getUTCMonth\(\)/,
            );
        });

        it('the Epic 49 "Less … More" 5-swatch strip is gone', () => {
            const stripped = CALENDAR.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).not.toMatch(/>Less</);
            expect(stripped).not.toMatch(/>More</);
        });
    });

    describe('R21-PR-A foundation vocabulary', () => {
        it('CalendarHeatmap imports useHeatScale + ChartLegend', () => {
            expect(CALENDAR).toMatch(/useHeatScale/);
            expect(CALENDAR).toMatch(/ChartLegend/);
        });

        it('CalendarHeatmap paints cells via heat.colorFor (no bespoke palette)', () => {
            expect(CALENDAR).toMatch(/heat\.colorFor/);
        });
    });
});

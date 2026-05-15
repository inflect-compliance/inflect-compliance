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
const RISK = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/RiskHeatmap.tsx'),
    'utf8',
);
const CALENDAR = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/CalendarHeatmap.tsx'),
    'utf8',
);

describe('R21-PR-C — Heatmap rebuild on R21-PR-A foundation', () => {
    describe('RiskHeatmap', () => {
        it('imports useHeatScale + ChartLegend from the charts barrel', () => {
            expect(RISK).toMatch(/from\s+['"]@\/components\/ui\/charts['"]/);
            expect(RISK).toMatch(/useHeatScale/);
            expect(RISK).toMatch(/ChartLegend/);
        });

        it('wires useHeatScale with the score domain [1, scale²] + series 4', () => {
            // The score domain is `likelihood × impact` — for a 5×5
            // matrix that's [1, 25]. The domain is parametric on
            // `scale` so a future 10×10 use case scales cleanly.
            expect(RISK).toMatch(/domain:\s*\[1,\s*scoreMax\]/);
            expect(RISK).toMatch(/scoreMax\s*=\s*scale\s*\*\s*scale/);
            expect(RISK).toMatch(/series:\s*4/);
        });

        it('cell background paints via heat.colorFor(score)', () => {
            expect(RISK).toMatch(/background:\s*heat\.colorFor\(score\)/);
        });

        it('the bespoke getCellColor hex palette is gone', () => {
            // Stripping comments so historical doc-block references
            // don't trip the check.
            const stripped = RISK.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).not.toMatch(/getCellColor/);
            expect(stripped).not.toMatch(/bg-red-500/);
            expect(stripped).not.toMatch(/bg-emerald-500/);
        });

        it('hover crosshair highlights row + column', () => {
            // The crosshair state carries `likelihood` + `impact`;
            // a cell is on the crosshair if EITHER matches the
            // hovered cell's coords.
            expect(RISK).toMatch(/setHovered\(\{\s*likelihood,\s*impact\s*\}\)/);
            expect(RISK).toMatch(
                /hovered\.likelihood\s*===\s*likelihood\s*\|\|\s*hovered\.impact\s*===\s*impact/,
            );
            expect(RISK).toMatch(/data-cell-crosshair/);
        });

        it('row + column axis labels also light up on crosshair', () => {
            // Subtle affordance — the eye scans up to the row
            // number + across to the column number; lighting both
            // up reinforces the matrix coordinate read.
            expect(RISK).toMatch(
                /hovered\?\.likelihood\s*===\s*likelihood/,
            );
            expect(RISK).toMatch(/hovered\?\.impact\s*===\s*impact/);
        });

        it('onSelectCell fires only when count > 0', () => {
            // count=0 cells are not clickable (nothing to drill
            // into). The `disabled` + `clickable` gates prevent
            // spurious callbacks.
            expect(RISK).toMatch(/clickable\s*=\s*count\s*>\s*0\s*&&\s*Boolean\(onSelectCell\)/);
            expect(RISK).toMatch(/disabled=\{!clickable\}/);
            expect(RISK).toMatch(/onSelectCell\?\.\(\{[\s\S]*?likelihood[\s\S]*?impact[\s\S]*?count[\s\S]*?\}\)/);
        });

        it('empty cells paint at heat-scale floor opacity 0.4 (still part of vocabulary)', () => {
            expect(RISK).toMatch(/count\s*===\s*0\s*\?\s*0\.4\s*:\s*1/);
        });

        it('<ChartLegend variant="gradient"> replaces the 4-swatch legend', () => {
            expect(RISK).toMatch(/<ChartLegend/);
            expect(RISK).toMatch(/variant="gradient"/);
            expect(RISK).toMatch(/heatScale=\{heat\}/);
            // And the old 4-swatch legend block is gone.
            const stripped = RISK.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).not.toMatch(/{\s*label:\s*['"]Critical['"]/);
        });
    });

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

    describe('Shared vocabulary — both heatmaps speak the same R21-PR-A foundation', () => {
        it('both files import useHeatScale + ChartLegend', () => {
            for (const src of [RISK, CALENDAR]) {
                expect(src).toMatch(/useHeatScale/);
                expect(src).toMatch(/ChartLegend/);
            }
        });

        it('both files paint cells via heat.colorFor (no bespoke palettes)', () => {
            for (const src of [RISK, CALENDAR]) {
                expect(src).toMatch(/heat\.colorFor/);
            }
        });
    });
});

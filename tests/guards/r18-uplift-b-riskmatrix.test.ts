/**
 * R18 visible-uplift B — RiskMatrix heatmap gloss.
 *
 * Uplift-A glossified the DonutChart, Areas (TrendCards), and
 * ProgressCard. Uplift-B finishes the dashboard's chart inventory:
 * the RiskMatrix heatmap.
 *
 * `RiskMatrixCell` is an HTML `<div>` (not an SVG chart), so —
 * like the ProgressCard track — it can't use R18's SVG-only
 * `<ChartGloss>` primitive. It gets the same white→transparent
 * CSS ramp, here as a `::before` so the sheen paints OVER the
 * `band.color` fill but UNDER the count span (the count's own
 * `absolute inset-0` span renders after the pseudo).
 *
 * Three load-bearing invariants:
 *
 *   1. The cell's `::before` gloss is gated on `!isEmpty` — only
 *      FILLED cells get the sheen. Empty cells stay the flat
 *      `bg-bg-subtle` fallback (a glossy empty cell would read
 *      as "filled with nothing").
 *
 *   2. The `::before` is `inset-0` + `rounded-sm` (tracks the
 *      cell shape) + `pointer-events-none` (never eats a click —
 *      cells are interactive).
 *
 *   3. The ramp is the canonical white→transparent gloss CSS
 *      gradient — the same visual language as the ProgressCard
 *      track from Uplift-A.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const CELL = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/RiskMatrixCell.tsx'),
    'utf8',
);

describe('R18 visible-uplift B — RiskMatrix heatmap gloss', () => {
    it('the ::before gloss is gated on !isEmpty (filled cells only)', () => {
        expect(CELL).toMatch(
            /!isEmpty\s*\?\s*["'][^"']*before:content-\[''\]/,
        );
    });

    it('the ::before tracks the cell shape and never eats a click', () => {
        expect(CELL).toMatch(
            /before:content-\[''\][\s\S]*?before:absolute[\s\S]*?before:inset-0[\s\S]*?before:rounded-sm[\s\S]*?before:pointer-events-none/,
        );
    });

    it('the ramp is the canonical white→transparent gloss gradient', () => {
        expect(CELL).toMatch(
            /before:bg-\[linear-gradient\(180deg,rgba\(255,255,255,0\.22\)/,
        );
    });
});

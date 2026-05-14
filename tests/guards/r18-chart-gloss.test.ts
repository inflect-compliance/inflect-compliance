/**
 * R18-PR1 — `<ChartGloss>` specular-highlight primitive.
 *
 * First PR of Roadmap-18 (Charts II — Fluid & Glossy). The gloss
 * primitive is the foundation the donut sheen (PR-4), line stroke
 * gloss (PR-7), and bar gloss (PR-8) all paint with.
 *
 * Six load-bearing invariants:
 *
 *   1. The component renders a `<linearGradient>` (a `<defs>`
 *      entry), NOT a wrapper element — same shape as the R16
 *      `<ChartLinearGradient>` family it sits beside.
 *
 *   2. The ramp is WHITE at every stop. A specular highlight is
 *      the colour of the light source, not the surface — a
 *      tinted ramp would read as "the colour got lighter," not
 *      "light is hitting glass." White also makes the primitive
 *      theme-independent.
 *
 *   3. The ramp ENDS fully transparent (`stopOpacity={0}` at
 *      100%). The gloss is an OVERLAY — the colour layer beneath
 *      must show through everywhere except the sheen band.
 *
 *   4. Three intensity steps map to discrete peak opacities
 *      (subtle 0.18 / default 0.32 / bright 0.48). A freeform
 *      number would let the gloss vocabulary drift.
 *
 *   5. The 45% knee exists — the ramp is NOT a linear two-stop
 *      fade. A real specular highlight concentrates near the lit
 *      edge and falls off fast; the mid-stop at 45% with
 *      `peak × 0.15` is what makes it read as a highlight rather
 *      than a uniform wash.
 *
 *   6. `chartGlossId` mirrors `chartGradientId` — id-with-suffix
 *      when a seriesIndex is supplied, bare id otherwise.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/chart-gloss.tsx'),
    'utf8',
);

// chart-gloss.tsx also houses `<ChartSheenSweep>` (R18-PR10).
// Scope the per-PR-1 assertions to the `ChartGloss` function body
// so the sheen-sweep code (which has its own white stops) doesn't
// pollute the counts. `ChartGloss` ends where the `chartGlossId`
// helper begins.
const GLOSS_FN = SRC.slice(
    SRC.indexOf('export function ChartGloss('),
    SRC.indexOf('export function chartGlossId('),
);

describe('R18-PR1 — ChartGloss specular-highlight primitive', () => {
    it('renders a <linearGradient> def (not a wrapper element)', () => {
        expect(GLOSS_FN).toMatch(/<linearGradient\s+id=\{id\}/);
        expect(GLOSS_FN).toMatch(/<\/linearGradient>/);
    });

    it('every stop is white — a highlight is the light source colour, not the surface', () => {
        const stops = GLOSS_FN.match(/stopColor="#ffffff"/g);
        expect(stops).not.toBeNull();
        // Three stops: 0% / 45% / 100%, all white.
        expect(stops!.length).toBe(3);
        // No tinted / token-coloured stops.
        expect(GLOSS_FN).not.toMatch(/stopColor=\{/);
        expect(GLOSS_FN).not.toMatch(/stopColor="var\(/);
    });

    it('the ramp ends fully transparent (overlay contract)', () => {
        // 100% stop MUST be stopOpacity={0} — the colour layer
        // below shows through everywhere except the sheen.
        expect(GLOSS_FN).toMatch(
            /offset="100%"\s+stopColor="#ffffff"\s+stopOpacity=\{0\}/,
        );
    });

    it('three discrete intensity steps map to peak opacities', () => {
        expect(SRC).toMatch(
            /INTENSITY_PEAK:\s*Record<ChartGlossIntensity,\s*number>\s*=\s*\{[\s\S]*?subtle:\s*0\.18[\s\S]*?default:\s*0\.32[\s\S]*?bright:\s*0\.48/,
        );
    });

    it('has a 45% knee — concentrates the sheen, not a uniform wash', () => {
        // The mid-stop at 45% with peak × 0.15 is what makes the
        // gloss read as a HIGHLIGHT (narrow, fast falloff) rather
        // than the whole shape getting lighter.
        expect(GLOSS_FN).toMatch(
            /offset="45%"[\s\S]*?stopOpacity=\{peak\s*\*\s*0\.15\}/,
        );
    });

    it('chartGlossId mirrors chartGradientId (suffix when seriesIndex given)', () => {
        expect(SRC).toMatch(
            /export\s+function\s+chartGlossId\(chartId:\s*string,\s*seriesIndex\?:\s*number\)/,
        );
        expect(SRC).toMatch(/\$\{chartId\}-gloss`/);
        expect(SRC).toMatch(/\$\{chartId\}-gloss-\$\{seriesIndex\}`/);
    });
});

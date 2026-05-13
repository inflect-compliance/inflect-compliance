/**
 * Roadmap-16 PR-7 — `<LineChart>` primitive.
 *
 * Smooth single-series line chart with area-under-line gradient
 * fade and on-mount path draw. The R16 line chart vocabulary.
 *
 * Six load-bearing invariants:
 *
 *   1. File exists, named export.
 *
 *   2. Uses `curveCatmullRom` for the smooth interpolation. The
 *      user asked for no sharp corners — catmull-rom passes
 *      through every data point and smooths the in-between.
 *
 *   3. Wraps in `<ChartFrame>` for state-driven branches
 *      (loading / empty / error / ready).
 *
 *   4. Stroke gradient via `<ChartLinearGradient>` resolving
 *      through the R16-PR1 series palette.
 *
 *   5. Area-under-line gradient FADES from `--chart-series-{N}-
 *      start` at the top to fully transparent at the bottom
 *      (3-stop linear gradient with stop-opacity 0.45 / 0.15 / 0).
 *      A constant-fill area would look like a stamp; the fade is
 *      what gives the line its "trend" character.
 *
 *   6. On-mount animations:
 *        - Area fades in via framer-motion opacity 0 → 1 over
 *          600 ms ease-out (matches `--chart-mount-duration`).
 *        - Line path draws left-to-right via framer-motion
 *          pathLength 0 → 1 on `<motion.path>` (NOT motion.g —
 *          pathLength is a path-element prop in framer-motion).
 *
 *   7. Re-exported from the charts barrel.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const LINE_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/line-chart.tsx'),
    'utf8',
);
const BARREL_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/index.ts'),
    'utf8',
);

describe('Roadmap-16 PR-7 — LineChart primitive', () => {
    describe('file exists + barrel re-export', () => {
        it('exports LineChart', () => {
            expect(LINE_SRC).toMatch(/export\s+function\s+LineChart\s*\(/);
        });

        it('barrel re-exports LineChart from `./line-chart`', () => {
            expect(BARREL_SRC).toMatch(
                /export\s*\{\s*LineChart\s*\}\s*from\s*['"]\.\/line-chart['"]/,
            );
        });
    });

    describe('imports', () => {
        it('imports curveCatmullRom from @visx/curve', () => {
            // No sharp corners. Catmull-rom passes through every
            // data point and smooths the in-between geometry —
            // the user's "subtle gradient feel" foundation.
            expect(LINE_SRC).toMatch(
                /import\s*\{\s*curveCatmullRom\s*\}\s*from\s*['"]@visx\/curve['"]/,
            );
        });

        it('imports Area + LinePath from @visx/shape', () => {
            expect(LINE_SRC).toMatch(
                /import\s*\{[\s\S]*?Area[\s\S]*?LinePath[\s\S]*?\}\s*from\s*['"]@visx\/shape['"]/,
            );
        });

        it('imports motion from motion/react (for path-draw animation)', () => {
            expect(LINE_SRC).toMatch(
                /import\s*\{[\s\S]*?motion[\s\S]*?\}\s*from\s*['"]motion\/react['"]/,
            );
        });

        it('imports ChartFrame + ChartLinearGradient', () => {
            expect(LINE_SRC).toMatch(/import\s*\{[\s\S]*?ChartFrame[\s\S]*?\}/);
            expect(LINE_SRC).toMatch(
                /import\s*\{[\s\S]*?ChartLinearGradient[\s\S]*?\}/,
            );
        });
    });

    describe('frame + render-prop', () => {
        it('renders inside <ChartFrame state={state}>', () => {
            // ChartFrame handles loading / empty / error branches.
            // Without it, every LineChart consumer would repeat
            // the branch-switching themselves.
            expect(LINE_SRC).toMatch(/<ChartFrame\s+state=\{state\}/);
        });

        it('reads { width, height, data } from the frame render-prop', () => {
            expect(LINE_SRC).toMatch(
                /\(\s*\{\s*width\s*,\s*height\s*,\s*data\s*\}\s*\)/,
            );
        });
    });

    describe('gradient defs — stroke + area', () => {
        it('renders <ChartLinearGradient> for the stroke', () => {
            expect(LINE_SRC).toMatch(/<ChartLinearGradient/);
        });

        it('renders an inline <linearGradient> for the area with vertical fade', () => {
            // The area gradient fades from start-stop at the top
            // to fully transparent at the bottom. R16-PR1's
            // ChartLinearGradient doesn't natively express stop-
            // opacity 0 at one end, so the area gradient is
            // built inline.
            expect(LINE_SRC).toMatch(
                /<linearGradient[\s\S]*?x1="0%"\s+y1="0%"\s+x2="0%"\s+y2="100%"/,
            );
        });

        it('area gradient bottom stop has stop-opacity={0}', () => {
            // The fade-to-floor effect. Without stop-opacity 0,
            // the area renders as a flat rectangle of muted brand
            // and the chart loses its "trend" character.
            expect(LINE_SRC).toMatch(/stopOpacity=\{0\}/);
        });
    });

    describe('curve + path render', () => {
        it('uses curveCatmullRom on Area + LinePath', () => {
            // Both shapes share the curve so the stroke and the
            // area-fill follow the same geometry.
            const catmullRefs =
                LINE_SRC.match(/curve=\{curveCatmullRom\}/g) ?? [];
            expect(catmullRefs.length).toBeGreaterThanOrEqual(2);
        });

        it('LinePath uses the render-prop API to feed d into <motion.path>', () => {
            // framer-motion's `pathLength` animation works on
            // `<motion.path>` directly — applying it to
            // `<motion.g>` does nothing. So we get the d-string
            // out of visx via the LinePath children render prop.
            expect(LINE_SRC).toMatch(/<LinePath[\s\S]*?>\s*\{\s*\(\s*\{\s*path\s*\}\s*\)\s*=>/);
            expect(LINE_SRC).toMatch(/<motion\.path\b/);
        });
    });

    describe('mount animations', () => {
        it('animates pathLength 0 → 1 on the line', () => {
            expect(LINE_SRC).toMatch(/initial=\{\{\s*pathLength:\s*0\s*\}\}/);
            expect(LINE_SRC).toMatch(/animate=\{\{\s*pathLength:\s*1\s*\}\}/);
        });

        it('animates area opacity 0 → 1 alongside', () => {
            expect(LINE_SRC).toMatch(/initial=\{\{\s*opacity:\s*0\s*\}\}/);
            expect(LINE_SRC).toMatch(/animate=\{\{\s*opacity:\s*1\s*\}\}/);
        });

        it('mount duration matches --chart-mount-duration: 600ms', () => {
            // The R16-PR1 token. Locked here as a fallback for
            // SSR / tests where CSS vars don't resolve.
            expect(LINE_SRC).toMatch(/MOUNT_DURATION_MS\s*=\s*600/);
        });

        it('uses ease-out (no abrupt deceleration)', () => {
            // ease-out lands the line softly at full draw, rather
            // than running fastest at the end.
            expect(LINE_SRC).toMatch(/ease:\s*['"]easeOut['"]/);
        });
    });
});

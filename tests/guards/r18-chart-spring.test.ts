/**
 * R18-PR2 — `useChartSpring` bubbly-settle entrance spring.
 *
 * The motion engine the rest of Roadmap-18 builds "bubbly" on:
 * the donut bubble-entrance (PR-5), the bar settle-bounce (PR-8),
 * and the hover bubble-out (PR-9) all drive their shapes through
 * this hook's overshoot-and-settle curve.
 *
 * Six load-bearing invariants:
 *
 *   1. SSR-safe initial state — the hook's initial `useState` is
 *      `1` (settled), NOT `0`. The server renders the final
 *      chart; the spring only engages after the client mount
 *      effect. This is the exact lesson R17-PR5 (count-up) was
 *      DEFERRED over — a `0` initial would flash a
 *      hydration-mismatch.
 *
 *   2. `prefers-reduced-motion: reduce` short-circuits to `1`
 *      with no animation — via the shared `useReducedMotion`
 *      hook the rest of chart-motion.tsx already uses.
 *
 *   3. The curve is `easeOutBack` — an overshoot-and-settle
 *      cubic, NOT a plain ease-out. The overshoot is what makes
 *      it "bubbly."
 *
 *   4. The spring SNAPS to exactly `1` at the end (float drift
 *      from the cubic could otherwise leave a sliver) AND on
 *      cleanup (so a deps-change re-run never starts mid-
 *      overshoot).
 *
 *   5. The duration + overshoot constants are exported so
 *      consumers compose against the named vocabulary instead
 *      of magic numbers — 520ms, 0.1 overshoot.
 *
 *   6. The hook returns a pure number — no DOM writes, no refs.
 *      Consumers decide whether the value drives a `scale()`, an
 *      arc radius, or a bar height.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/chart-motion.tsx'),
    'utf8',
);

describe('R18-PR2 — useChartSpring bubbly-settle spring', () => {
    it('initial useState is 1 (SSR-safe, no hydration flash)', () => {
        // The R17-PR5 count-up deferral lesson, applied: a `0`
        // initial would mismatch the server-rendered final chart.
        expect(SRC).toMatch(
            /useChartSpring[\s\S]*?const\s+\[progress,\s*setProgress\]\s*=\s*useState\(1\)/,
        );
    });

    it('honours prefers-reduced-motion via the shared useReducedMotion hook', () => {
        expect(SRC).toMatch(
            /useChartSpring[\s\S]*?const\s+reduced\s*=\s*useReducedMotion\(\)/,
        );
        expect(SRC).toMatch(
            /useChartSpring[\s\S]*?if\s*\(!enabled\s*\|\|\s*reduced\)\s*\{\s*setProgress\(1\)/,
        );
    });

    it('drives the overshoot via an easeOutBack cubic, not a plain ease-out', () => {
        // easeOutBack: f(t) = 1 + c3·(t-1)³ + c1·(t-1)²
        expect(SRC).toMatch(/function\s+easeOutBack\(t:\s*number,\s*overshoot:\s*number\)/);
        expect(SRC).toMatch(/c3\s*\*\s*p\s*\*\s*p\s*\*\s*p\s*\+\s*c1\s*\*\s*p\s*\*\s*p/);
    });

    it('snaps to exactly 1 at the end AND on cleanup', () => {
        // End-of-animation snap (float drift guard).
        expect(SRC).toMatch(
            /linear\s*<\s*1[\s\S]*?\}\s*else\s*\{[\s\S]*?setProgress\(1\)/,
        );
        // Cleanup snap (deps-change re-run guard).
        expect(SRC).toMatch(
            /return\s*\(\)\s*=>\s*\{[\s\S]*?cancelAnimationFrame\(raf\)[\s\S]*?setProgress\(1\)/,
        );
    });

    it('exports the named duration + overshoot constants', () => {
        expect(SRC).toMatch(
            /export\s+const\s+CHART_SPRING_DURATION_MS\s*=\s*520/,
        );
        expect(SRC).toMatch(
            /export\s+const\s+CHART_SPRING_OVERSHOOT\s*=\s*0\.1/,
        );
    });

    it('returns a pure number — no DOM writes, no refs', () => {
        // Contrast with useChartFlow (returns a ref, writes
        // attributes). useChartSpring is value-out only.
        expect(SRC).toMatch(
            /export\s+function\s+useChartSpring\([\s\S]*?\):\s*number\s*\{/,
        );
        // Its body must not contain a useRef or setAttribute.
        // Bound the slice to JUST the useChartSpring function —
        // R18-PR10 appended `useChartSheen` to this file AFTER
        // useChartSpring, and that hook DOES use a ref +
        // setAttribute (it's the moving-sheen counterpart). The
        // slice ends where the PR-10 section comment begins.
        const springStart = SRC.indexOf(
            'export function useChartSpring',
        );
        const pr10Start = SRC.indexOf(
            'Roadmap-18 PR-10 — useChartSheen',
        );
        const springBody = SRC.slice(
            springStart,
            pr10Start > springStart ? pr10Start : undefined,
        );
        expect(springBody).not.toMatch(/useRef\(/);
        expect(springBody).not.toMatch(/setAttribute\(/);
    });
});

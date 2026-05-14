/**
 * R18-PR3 — soft-shadow token + bubble-entrance keyframes.
 *
 * The CSS-side of the Roadmap-18 "bubbly" vocabulary. PR-2 shipped
 * the JS spring hook (`useChartSpring`); PR-3 ships the pure-CSS
 * counterparts for chart surfaces that animate via a className
 * rather than a per-shape progress value:
 *
 *   • `--chart-soft-shadow` — the drop shadow chart SURFACES cast
 *     to lift off the card behind them. Theme-aware: heavier in
 *     dark (38% black), lighter in light (15%) so it reads as a
 *     floating glossy object in both, not a hard smudge.
 *   • `chart-bubble-in` keyframe + animation — the CSS sibling of
 *     `useChartSpring`. Mirrors easeOutBack: scale 0.8 →
 *     overshoot 1.05 at 70% → settle 1.
 *
 * Six load-bearing invariants:
 *
 *   1. `--chart-soft-shadow` is defined in BOTH theme blocks of
 *      tokens.css (dark + light). A chart surface that picks up
 *      the token must work in both themes.
 *
 *   2. The dark + light shadow values DIFFER — dark uses a
 *      higher alpha (a dark surface needs a darker shadow to
 *      register). If they were identical, one theme would have
 *      an invisible or a too-heavy shadow.
 *
 *   3. `shadow-chart-soft` is wired into the Tailwind boxShadow
 *      scale, token-backed (`var(--chart-soft-shadow)`), so
 *      consumers reach for the utility, not an inline style.
 *
 *   4. The `chart-bubble-in` keyframe has the OVERSHOOT keyframe
 *      — a `scale(1.05)` at the 70% mark. Without it the surface
 *      just grows; the overshoot is what makes it "bubble."
 *
 *   5. The keyframe settles to EXACTLY `scale(1)` at 100% — same
 *      land-on-1 contract as the JS spring.
 *
 *   6. The animation runs at 520ms — matching
 *      `--chart-bubble-duration` AND the JS
 *      `CHART_SPRING_DURATION_MS` — so the CSS path and the JS
 *      path read as the same motion.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const TOKENS = fs.readFileSync(
    path.join(ROOT, 'src/styles/tokens.css'),
    'utf8',
);
const TW_CONFIG = fs.readFileSync(
    path.join(ROOT, 'tailwind.config.js'),
    'utf8',
);

describe('R18-PR3 — soft-shadow token + bubble-entrance keyframes', () => {
    it('--chart-soft-shadow is defined in both theme blocks', () => {
        const matches = TOKENS.match(/--chart-soft-shadow:/g);
        expect(matches).not.toBeNull();
        // One in the dark (default) block, one in the light block.
        expect(matches!.length).toBe(2);
    });

    it('the dark + light soft-shadow values differ (theme-tuned alpha)', () => {
        const values = [
            ...TOKENS.matchAll(/--chart-soft-shadow:\s*([^;]+);/g),
        ].map((m) => m[1].trim());
        expect(values.length).toBe(2);
        expect(values[0]).not.toBe(values[1]);
        // Dark block (first) carries the higher-alpha near-black
        // shadow; light block carries the slate-tinted lighter one.
        expect(values[0]).toMatch(/rgba\(0,\s*0,\s*0,\s*0\.38\)/);
        expect(values[1]).toMatch(/rgba\(15,\s*23,\s*42,\s*0\.15\)/);
    });

    it('shadow-chart-soft is wired into the Tailwind boxShadow scale, token-backed', () => {
        expect(TW_CONFIG).toMatch(
            /'chart-soft':\s*'var\(--chart-soft-shadow\)'/,
        );
    });

    it('chart-bubble-in keyframe has the 70% overshoot scale(1.05)', () => {
        // The overshoot keyframe — without it the surface grows
        // but doesn't bubble.
        expect(TW_CONFIG).toMatch(
            /'chart-bubble-in':\s*\{[\s\S]*?'70%':\s*\{\s*transform:\s*'scale\(1\.05\)'\s*\}/,
        );
    });

    it('chart-bubble-in keyframe settles to exactly scale(1) at 100%', () => {
        expect(TW_CONFIG).toMatch(
            /'chart-bubble-in':\s*\{[\s\S]*?'100%':\s*\{\s*opacity:\s*'1',\s*transform:\s*'scale\(1\)'\s*\}/,
        );
    });

    it('chart-bubble-in animation runs at 520ms (matches JS spring + token)', () => {
        expect(TW_CONFIG).toMatch(
            /'chart-bubble-in':\s*\n?\s*'chart-bubble-in\s+520ms\s+ease-out'/,
        );
        // The token agrees.
        expect(TOKENS).toMatch(/--chart-bubble-duration:\s*520ms/);
    });
});

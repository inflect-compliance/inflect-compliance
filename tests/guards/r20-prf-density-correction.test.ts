/**
 * R20-PR-F — Density correction ratchet.
 *
 * R20-PR-C had pushed md/lg button padding UP for an "airy density"
 * feel (md px-3.5 → px-4; lg px-5 → px-6; lg gap-tight → gap-2.5).
 * In practice, on dense toolbars (gear-trigger + text buttons +
 * primary CTA) the air read as "idle space around the label" —
 * the text inside each button felt small relative to the chrome.
 *
 * PR-F tightens md/lg BELOW pre-PR-C levels:
 *   md  px-4 → px-3
 *   lg  px-6 → px-4
 *   lg  gap-2.5 → gap-tight   (PR-C's 10px gap was a compensation
 *                              for the airy padding; with tighter
 *                              padding the icon↔label rhythm wants
 *                              to tighten back too)
 *
 * xs/sm stay where PR-C left them — small buttons want density,
 * which PR-C already respected.
 *
 * Tracking + weight ladder (PR-C / PR-E) are untouched. They live
 * on a different axis (typographic weight, not spatial chrome) and
 * the user's correction was scoped to chrome.
 *
 * This ratchet locks the corrected values explicitly. The R20-PR-C
 * ratchet was updated in-place to mirror the new scale (and to
 * INVERT its old "px-4 must be present" assertions into "px-4
 * must NOT be present" — so a future revert toward wider padding
 * fires both ratchets at once).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const VARIANTS = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/button-variants.ts'),
    'utf8',
);
const BUTTON_TSX = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/button.tsx'),
    'utf8',
);

function sizeBlock(): string {
    return VARIANTS.match(/size:\s*\{([\s\S]*?)\},?\s*\}/)?.[1] ?? '';
}
function sizeClasses(size: 'xs' | 'sm' | 'md' | 'lg'): string {
    const re = new RegExp(`${size}:\\s*["']([^"']+)["']`);
    return sizeBlock().match(re)?.[1] ?? '';
}

describe('R20-PR-F — button density correction', () => {
    describe('the corrected md/lg padding scale', () => {
        it('md horizontal padding is `px-3` (down from PR-C `px-4`)', () => {
            // button-density-tighter (2026-05-15) tightened
            // again: md px-3 → px-2.5, lg px-4 → px-3, sm px-3 →
            // px-2.5, xs px-2.5 → px-2. All assertions below
            // updated to the current scale; the wider PR-F values
            // are asserted ABSENT on the dimensions they changed.
            expect(sizeClasses('md')).toMatch(/\bpx-2\.5\b/);
        });

        it('lg horizontal padding is `px-3` (down from PR-F `px-4`)', () => {
            expect(sizeClasses('lg')).toMatch(/\bpx-3\b/);
        });

        it('lg uses `gap-tight` (R20-PR-F collapsed from PR-C gap-2.5)', () => {
            expect(sizeClasses('lg')).toMatch(/\bgap-tight\b/);
        });

        it('the wider values are NOT present at md/lg', () => {
            // A future revert toward "airy density" would put px-4
            // back on md (or px-3) or px-6/px-4 on lg. This asserts
            // the corrections are locked.
            expect(sizeClasses('md')).not.toMatch(/\bpx-4\b/);
            expect(sizeClasses('md')).not.toMatch(/\bpx-3\b/);
            expect(sizeClasses('lg')).not.toMatch(/\bpx-6\b/);
            expect(sizeClasses('lg')).not.toMatch(/\bpx-4\b/);
            expect(sizeClasses('lg')).not.toMatch(/\bgap-2\.5\b/);
        });
    });

    describe('xs/sm tightened too in button-density-tighter pass', () => {
        it('xs at `h-7 px-2 gap-1` (px-2.5 → px-2)', () => {
            const c = sizeClasses('xs');
            expect(c).toMatch(/\bh-7\b/);
            expect(c).toMatch(/\bpx-2\b/);
            expect(c).not.toMatch(/\bpx-2\.5\b/);
            expect(c).toMatch(/\bgap-1\b/);
        });
        it('sm at `h-8 px-2.5 gap-1.5` (px-3 → px-2.5)', () => {
            const c = sizeClasses('sm');
            expect(c).toMatch(/\bh-8\b/);
            expect(c).toMatch(/\bpx-2\.5\b/);
            expect(c).not.toMatch(/\bpx-3\b/);
            expect(c).toMatch(/\bgap-1\.5\b/);
        });
    });

    describe('PR-C / PR-E refinements survive the correction', () => {
        // PR-F is scoped to spatial chrome (padding + gap). The
        // typographic refinements from PR-C (per-size tracking) and
        // PR-E (graded weight ladder) MUST be preserved.
        it('per-size tracking ladder survives', () => {
            expect(sizeClasses('xs')).toMatch(/tracking-\[0\.005em\]/);
            expect(sizeClasses('sm')).toMatch(/tracking-\[0\.01em\]/);
            expect(sizeClasses('md')).toMatch(/tracking-\[-0\.005em\]/);
            expect(sizeClasses('lg')).toMatch(/tracking-\[-0\.01em\]/);
        });
        it('per-size weight ladder survives', () => {
            expect(sizeClasses('xs')).toMatch(/\bfont-medium\b/);
            expect(sizeClasses('sm')).toMatch(/\bfont-medium\b/);
            expect(sizeClasses('md')).toMatch(/\bfont-semibold\b/);
            expect(sizeClasses('lg')).toMatch(/\bfont-bold\b/);
        });
    });

    describe('disabled-fallback mirror in button.tsx tracks the correction', () => {
        // button-density-tighter values: md px-2.5, lg px-3.
        it('disabled-fallback md (no size) uses `px-2.5`', () => {
            expect(BUTTON_TSX).toMatch(/!size && "h-9 px-2\.5 gap-tight font-semibold/);
        });
        it('disabled-fallback lg uses `px-3` + `gap-tight`', () => {
            expect(BUTTON_TSX).toMatch(/size === "lg" && "h-10 px-3 gap-tight font-bold/);
        });
        it('disabledTooltip md (no size) uses `px-2.5`', () => {
            expect(BUTTON_TSX).toMatch(/!size && "h-9 px-2\.5 font-semibold/);
        });
        it('disabledTooltip lg uses `px-3`', () => {
            expect(BUTTON_TSX).toMatch(/size === "lg" && "h-10 px-3 font-bold/);
        });
    });
});

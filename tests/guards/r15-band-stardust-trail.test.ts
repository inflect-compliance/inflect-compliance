/**
 * Roadmap-15 PR-1 — Stardust particle trail along the band.
 *
 * The R13 band shimmer was honest but flat — a single linear
 * gradient panning along the band's length. R15-PR1 stacks three
 * white radial-gradient "particles" on top of the linear gradient:
 *
 *   leading  (50% 80%)  rgba(255,255,255,0.9)  — brightest
 *   mid      (50% 55%)  rgba(255,255,255,0.5)
 *   trailing (50% 30%)  rgba(255,255,255,0.2)  — faintest ghost
 *
 * The cascading alpha values produce a COMET TAIL effect — the
 * band visibly leaves a trace as the existing shimmer animation
 * pans the bg-position. The trail reads as "lightly disappearing
 * glitter" without competing with the band's brand hue palette
 * (which is why the particles are white, not brand-coloured —
 * brand-coloured particles disappear against the gradient).
 *
 * Mechanism: a single `before:bg-[...]` arbitrary value combines
 * three `radial-gradient(circle 1.5px at ...)` layers PLUS the
 * R13-PR2 `linear-gradient(to bottom, default, muted, emphasis)`.
 * Tailwind utility classes can only emit ONE background-image, so
 * the comprehensive arbitrary value is the only path that lets us
 * stack particles on the existing gradient.
 *
 * The shimmer (R13-PR3) drives the trail — `background-position`
 * pans the entire stack vertically over 4 seconds, so the
 * particles drift along the band's length. No additional keyframe
 * needed for PR-1.
 *
 * What this ratchet does NOT police:
 *   - The exact particle alpha values. Future tuning is allowed
 *     within the "decreasing alpha = trail" intent.
 *   - The particle positions (y%). The three-particle pattern
 *     IS locked; the exact y-values can shift.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const NAV_ITEM_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/nav-item.tsx'),
    'utf8',
);

describe('Roadmap-15 PR-1 — Stardust particle trail', () => {
    describe('NAV_ITEM_BAND_BASE recipe', () => {
        it('uses a single comprehensive `before:bg-[...]` arbitrary value', () => {
            // The R13 form was utility classes (`before:from-...`).
            // R15-PR1 needs the arbitrary value to stack multiple
            // background-image layers (particles + linear gradient).
            expect(NAV_ITEM_SRC).toMatch(/before:bg-\[radial-gradient/);
        });

        it('stacks THREE radial-gradient particle layers', () => {
            // Three particles compose the comet-trail shape.
            // Fewer reads as a single moving dot (no trail);
            // more starts to look like a string of LEDs rather
            // than dust.
            const bandRegion =
                NAV_ITEM_SRC.match(
                    /const\s+NAV_ITEM_BAND_BASE\s*=\s*\[[\s\S]+?\]\.join\(/,
                )?.[0] ?? '';
            const radialCount =
                bandRegion.match(/radial-gradient\(circle/g)?.length ?? 0;
            expect(radialCount).toBe(3);
        });

        it('the linear-gradient base layer is preserved', () => {
            // The particles are stacked ON the brand-gradient base
            // — not a replacement. The R13-PR2 3-stop linear
            // gradient stays at the bottom of the stack.
            expect(NAV_ITEM_SRC).toMatch(
                /linear-gradient\(to_bottom,[\s\S]*?var\(--brand-default\)[\s\S]*?var\(--brand-muted\)[\s\S]*?var\(--brand-emphasis\)/,
            );
        });

        it('particles use white at decreasing alpha (comet trail)', () => {
            // Decreasing alphas = visual trail. A regression that
            // sets all three to the same alpha would lose the
            // comet shape. The trio MUST contain at least three
            // distinct `rgba(255, 255, 255, ALPHA)` declarations.
            const alphas =
                NAV_ITEM_SRC.match(
                    /rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/g,
                )?.map((s) => parseFloat(s.match(/[\d.]+\)$/)?.[0] ?? '0'));
            expect(alphas).not.toBeUndefined();
            expect(alphas!.length).toBeGreaterThanOrEqual(3);
            // At least one alpha is > 0.5 (the bright leading
            // particle) AND at least one is < 0.3 (the trailing
            // ghost). This catches "all three set to 0.5" drift.
            expect(alphas!.some((a) => a > 0.5)).toBe(true);
            expect(alphas!.some((a) => a < 0.3)).toBe(true);
        });

        it('particles are white (not brand-coloured)', () => {
            // White against the brand gradient = "starlight". Brand-
            // coloured particles disappear into the gradient.
            const bandRegion =
                NAV_ITEM_SRC.match(
                    /const\s+NAV_ITEM_BAND_BASE\s*=\s*\[[\s\S]+?\]\.join\(/,
                )?.[0] ?? '';
            // Each radial-gradient should have rgba(255,255,255,...)
            // as its centre colour. A regression to `var(--brand-default)`
            // or similar inside a radial would lose the starlight effect.
            const radialBlocks =
                bandRegion.match(/radial-gradient\(circle[^)]+\)/g) ?? [];
            for (const block of radialBlocks) {
                expect(block).toMatch(/rgba\(255,\s*255,\s*255/);
            }
        });

        it('preserves the R13-PR3 bg-size that lets the shimmer pan', () => {
            // Without `background-size: 100% 200%` the gradient
            // would already cover the band 1:1 and the existing
            // shimmer keyframe (which pans bg-position) would be a
            // no-op. The stardust trail needs that pan to drift.
            expect(NAV_ITEM_SRC).toMatch(
                /before:\[background-size:100%_200%\]/,
            );
        });
    });
});

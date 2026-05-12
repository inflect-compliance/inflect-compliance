/**
 * Roadmap-13 PR-6 — Glossy top-edge highlight (`::after`).
 *
 * Until R13-PR6 the band (left edge) was the only decoration on a
 * hovered or active `<NavItem>` row. The user asked for buttons
 * that feel "glossy" and "inevitable" — R13-PR6 adds the second
 * piece of light: a hairline highlight on the row's top edge,
 * mimicking the way light catches the top of a physical raised
 * button.
 *
 * Implementation: a 1px tall `::after` pseudo-element, pinned 8px
 * inset from each side, painted with `--nav-gloss-highlight`
 * (theme-aware — white @ 8% on METRO's deep navy, white @ 70% on
 * PwC's cream). Opacity 0 by default; fades to 100 on hover +
 * active (200ms ease-out, same tempo as the band). Geometry stays
 * still; only opacity moves — preserves R12's motion-language
 * contract.
 *
 * The band + gloss together wrap the row in two coordinated lit
 * edges (left + top). R12-PR5's "jewellery" metaphor extends:
 * the band is the brooch, the gloss is the highlight on the
 * brooch's metal.
 *
 * What this ratchet does NOT police:
 *   - The exact alpha. Future tuning of the highlight's strength
 *     is allowed within the token. The plumbing is what's locked.
 *   - The bottom shadow (R13-PR7's job, separately ratchet'd).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const NAV_ITEM_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/nav-item.tsx'),
    'utf8',
);
const TOKENS_SRC = fs.readFileSync(
    path.join(ROOT, 'src/styles/tokens.css'),
    'utf8',
);

const DARK_BLOCK = TOKENS_SRC.match(/:root\s*\{[\s\S]*?\n\}/)![0];
const LIGHT_BLOCK = TOKENS_SRC.match(
    /\[data-theme="light"\]\s*\{[\s\S]*?\n\}/,
)![0];

describe('Roadmap-13 PR-6 — glossy top-edge highlight', () => {
    describe('--nav-gloss-highlight token (theme-aware)', () => {
        it('METRO declares --nav-gloss-highlight at low alpha white', () => {
            // White @ 8% is the sweet spot on deep navy: visible
            // enough to read as a top-edge highlight, low enough
            // to never compete with the band or label.
            expect(DARK_BLOCK).toMatch(
                /--nav-gloss-highlight:\s*rgba\(255,\s*255,\s*255,\s*0\.08\)/,
            );
        });

        it('PwC declares --nav-gloss-highlight at high alpha white', () => {
            // On cream the alpha needs to be much higher to get a
            // visible sliver — 0.70 lands the highlight as a
            // near-white line, still subtle relative to the page
            // but readable as "defined edge".
            expect(LIGHT_BLOCK).toMatch(
                /--nav-gloss-highlight:\s*rgba\(255,\s*255,\s*255,\s*0\.70\)/,
            );
        });

        it('both themes use white (255, 255, 255) — only alpha varies', () => {
            // The HUE of the highlight is theme-independent (white
            // is the universal "light catches edge" colour). Only
            // the alpha tunes for surface luminance. A future PR
            // that drifts to coloured highlights breaks the "glossy"
            // metaphor.
            for (const block of [DARK_BLOCK, LIGHT_BLOCK]) {
                expect(block).toMatch(
                    /--nav-gloss-highlight:\s*rgba\(255,\s*255,\s*255,/,
                );
            }
        });
    });

    describe('NAV_ITEM_GLOSS_BASE recipe', () => {
        it('declares the `::after` pseudo-element', () => {
            // `::after` is the gloss's slot. `::before` is owned by
            // the band; the two can never collide because each
            // pseudo-element is unique per real element.
            expect(NAV_ITEM_SRC).toMatch(
                /const\s+NAV_ITEM_GLOSS_BASE\s*=\s*\[/,
            );
            expect(NAV_ITEM_SRC).toMatch(/after:absolute/);
        });

        it('pins the highlight to the top edge with 8px side inset', () => {
            // `top-0` + `h-px` puts the line on the row's exact top
            // edge. `left-2 right-2` insets it 8px from each side so
            // it doesn't run all the way to the row's corners — the
            // shorter line reads as a deliberate highlight, the full
            // width would read as a hairline divider.
            const recipeBlock =
                NAV_ITEM_SRC.match(
                    /const\s+NAV_ITEM_GLOSS_BASE\s*=\s*\[[\s\S]+?\]\.join/,
                )?.[0] ?? '';
            expect(recipeBlock).toMatch(/after:left-2/);
            expect(recipeBlock).toMatch(/after:right-2/);
            expect(recipeBlock).toMatch(/after:top-0/);
            expect(recipeBlock).toMatch(/after:h-px/);
        });

        it('paints the highlight from --nav-gloss-highlight', () => {
            // Goes through the token — never hardcodes the rgba
            // value (would break theme parity).
            const recipeBlock =
                NAV_ITEM_SRC.match(
                    /const\s+NAV_ITEM_GLOSS_BASE\s*=\s*\[[\s\S]+?\]\.join/,
                )?.[0] ?? '';
            expect(recipeBlock).toMatch(
                /after:bg-\[var\(--nav-gloss-highlight\)\]/,
            );
        });

        it('rounds the line ends so the highlight does not terminate as a square stamp', () => {
            // `rounded-full` on a 1px-tall element rounds the
            // horizontal ends — the highlight terminates as a soft
            // taper rather than two right angles.
            const recipeBlock =
                NAV_ITEM_SRC.match(
                    /const\s+NAV_ITEM_GLOSS_BASE\s*=\s*\[[\s\S]+?\]\.join/,
                )?.[0] ?? '';
            expect(recipeBlock).toMatch(/after:rounded-full/);
        });

        it('disables pointer events on the highlight', () => {
            // The `::after` overlay sits in front of the row content
            // in z-order — without `pointer-events-none` it would
            // capture the top-1px of click area, making the row
            // mysteriously unclickable at its top edge.
            const recipeBlock =
                NAV_ITEM_SRC.match(
                    /const\s+NAV_ITEM_GLOSS_BASE\s*=\s*\[[\s\S]+?\]\.join/,
                )?.[0] ?? '';
            expect(recipeBlock).toMatch(/after:pointer-events-none/);
        });

        it('animates opacity only at 200ms ease-out', () => {
            // Same tempo as the band. Geometry stays still — no
            // transform, no translate, no scale. Motion-language
            // contract preserved.
            const recipeBlock =
                NAV_ITEM_SRC.match(
                    /const\s+NAV_ITEM_GLOSS_BASE\s*=\s*\[[\s\S]+?\]\.join/,
                )?.[0] ?? '';
            expect(recipeBlock).toMatch(/after:opacity-0\b/);
            expect(recipeBlock).toMatch(/after:transition-opacity/);
            expect(recipeBlock).toMatch(/after:duration-200/);
            expect(recipeBlock).toMatch(/after:ease-out/);
            expect(recipeBlock).not.toMatch(/after:transform/);
            expect(recipeBlock).not.toMatch(/after:translate-/);
            expect(recipeBlock).not.toMatch(/after:scale-/);
        });
    });

    describe('NAV_ITEM_BASE composes the gloss', () => {
        it('NAV_ITEM_BASE includes NAV_ITEM_GLOSS_BASE', () => {
            // The gloss only fires if the base composes it.
            const baseRegion =
                NAV_ITEM_SRC.match(
                    /export\s+const\s+NAV_ITEM_BASE\s*=\s*\[[\s\S]+?\]\.join\(/,
                )?.[0] ?? '';
            expect(baseRegion).toMatch(/NAV_ITEM_GLOSS_BASE/);
        });
    });

    describe('hover + active reveal the gloss', () => {
        it('NAV_ITEM_DEFAULT reveals the gloss on hover', () => {
            const defaultRecipe =
                NAV_ITEM_SRC.match(
                    /export\s+const\s+NAV_ITEM_DEFAULT\s*=\s*['"]([^'"]+)['"]/,
                )?.[1] ?? '';
            expect(defaultRecipe).toMatch(/hover:after:opacity-100/);
        });

        it('NAV_ITEM_ACTIVE holds the gloss visible unconditionally', () => {
            const activeRecipe =
                NAV_ITEM_SRC.match(
                    /export\s+const\s+NAV_ITEM_ACTIVE\s*=\s*['"]([^'"]+)['"]/,
                )?.[1] ?? '';
            // Match `after:opacity-100` without `hover:` prefix.
            expect(activeRecipe).toMatch(/(?<!hover:)\bafter:opacity-100\b/);
        });
    });
});

/**
 * B3 (2026-06-07) — pop-up surface texture.
 *
 * Modals, sheets, and the undo-toast notification share a single
 * `.surface-popup-texture` class (globals.css): a brand-tinted focal-glow
 * radial gradient (a whisper of brand at the centre, fading to the base
 * surface, a hair darker at the edges) + an "elegant" brand-tinted border +
 * a top inner-highlight (glass edge) over the drop shadow. One class serves
 * both themes via --bg-default / --brand-default / --border-default.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const GLOBALS = read('src/app/globals.css');
const MODAL = read('src/components/ui/modal.tsx');
const SHEET = read('src/components/ui/sheet.tsx');
const TOAST = read('src/components/ui/undo-toast.tsx');
const POPOVER = read('src/components/ui/popover.tsx');

describe('B3 — pop-up surface texture', () => {
    it('globals.css defines .surface-popup-texture as a brand-tinted focal glow', () => {
        const block =
            GLOBALS.match(/\.surface-popup-texture\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
        expect(block).toMatch(/radial-gradient/);
        // brand tint pooled at the centre + base surface + darker edge.
        expect(block).toMatch(/--brand-default/);
        expect(block).toMatch(/--bg-default/);
        // elegant border tinted with brand.
        expect(block).toMatch(
            /border:[\s\S]*?color-mix\(in srgb, var\(--border-default\), var\(--brand-default\)/,
        );
        // top glass-edge highlight over the drop shadow.
        expect(block).toMatch(/box-shadow:[\s\S]*?inset 0 1px 0/);
        expect(block).toMatch(/var\(--shadow-lg\)/);
    });

    it('modal, sheet, and undo-toast all adopt the texture class', () => {
        expect(MODAL).toMatch(/surface-popup-texture/);
        expect(SHEET).toMatch(/surface-popup-texture/);
        expect(TOAST).toMatch(/surface-popup-texture/);
    });

    // B3-follow (2026-06-08): the texture extended to popover surfaces so
    // the user menu, notifications, tenant/org switchers, and comboboxes
    // stop rendering flat. Both the desktop Radix content and the mobile
    // Vaul drawer carry it.
    it('popover (desktop content + mobile drawer) adopts the texture class', () => {
        const occurrences = POPOVER.match(/surface-popup-texture/g) ?? [];
        expect(occurrences.length).toBeGreaterThanOrEqual(2);
        // and no longer paints a flat bg-bg-default on the content surface.
        expect(POPOVER).not.toMatch(/bg-bg-default[^;"']*drop-shadow-lg/);
    });
});

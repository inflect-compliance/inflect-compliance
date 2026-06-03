/**
 * Structural guard — the semantic `brand` color tokens must exist.
 *
 * ~30 components reference named utilities `bg-brand-emphasis`,
 * `border-brand-emphasis`, `bg-brand-subtle`, `text-brand-default`,
 * etc. (radio dot, checkbox fill, switch, progress bars, date-picker
 * selected day, filter selected state, charts). Those only paint if
 * `theme.colors.brand` defines `default` / `emphasis` / `muted` /
 * `subtle` keys mapped to the `--brand-*` CSS vars. For a long time
 * those keys were ABSENT (brand was a numeric 50–950 scale only), so
 * every named usage resolved to nothing and rendered colorless — most
 * visibly, a selected radio "filled" with a transparent dot.
 *
 * This guard fails if any of the four semantic keys is removed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const CONFIG = fs.readFileSync(
    path.resolve(__dirname, '../../tailwind.config.js'),
    'utf8',
);

// Isolate the `brand: { ... }` color block so we don't match a
// stray `emphasis:` from another token (content/border also have one).
const brandBlock = CONFIG.match(/brand:\s*\{[\s\S]*?\}/)?.[0] ?? '';

describe('brand semantic color tokens', () => {
    it('the brand color block was found', () => {
        expect(brandBlock).toContain('brand:');
    });

    it.each([
        ['default', '--brand-default'],
        ['emphasis', '--brand-emphasis'],
        ['muted', '--brand-muted'],
        ['subtle', '--brand-subtle'],
    ])('brand.%s maps to var(%s)', (key, cssVar) => {
        const re = new RegExp(`${key}:\\s*'var\\(${cssVar}\\)'`);
        expect(brandBlock).toMatch(re);
    });
});

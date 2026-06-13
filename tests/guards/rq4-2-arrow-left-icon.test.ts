/**
 * RQ4-2 — `ArrowLeft` icon ratchet.
 *
 * The back affordance (RQ4-4) renders `<ArrowLeft />`. This ratchet locks
 * the icon's existence + key structural attributes so a future "simplify
 * the icon set" PR can't silently drop it.
 *
 * Static-only checks — runs in the `node` Jest project alongside the other
 * structural ratchets. A rendered counterpart can be added under
 * `tests/rendered/` if visual behaviour ever needs to be locked.
 */
import * as fs from 'fs';
import * as path from 'path';

const ICON_PATH = path.resolve(
    __dirname,
    '../../src/components/ui/icons/nucleo/arrow-left.tsx',
);
const BARREL_PATH = path.resolve(
    __dirname,
    '../../src/components/ui/icons/nucleo/index.ts',
);

describe('rq4-2 arrow-left icon', () => {
    it('the icon file exists', () => {
        expect(fs.existsSync(ICON_PATH)).toBe(true);
    });

    it('exports a named `ArrowLeft` component', () => {
        const source = fs.readFileSync(ICON_PATH, 'utf-8');
        expect(source).toMatch(/export\s+function\s+ArrowLeft\b/);
    });

    it('renders an SVG that uses currentColor (matches design token theming)', () => {
        const source = fs.readFileSync(ICON_PATH, 'utf-8');
        expect(source).toMatch(/<svg/);
        expect(source).toMatch(/currentColor/);
        expect(source).toMatch(/strokeWidth="1\.5"/);
    });

    it('uses an 18x18 viewBox matching ChevronLeft and the rest of the nucleo set', () => {
        const source = fs.readFileSync(ICON_PATH, 'utf-8');
        expect(source).toMatch(/viewBox="0 0 18 18"/);
        expect(source).toMatch(/height="18"/);
        expect(source).toMatch(/width="18"/);
    });

    it('is re-exported from the nucleo barrel', () => {
        const barrel = fs.readFileSync(BARREL_PATH, 'utf-8');
        expect(barrel).toMatch(/export \* from "\.\/arrow-left";/);
    });
});

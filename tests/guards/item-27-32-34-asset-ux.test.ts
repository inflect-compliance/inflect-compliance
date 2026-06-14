/**
 * Items 27 / 32 / 34 — asset list interaction ratchets.
 *
 * 34 — the asset table has a derived Criticality column.
 * 32 — a single row click opens the quick-look side panel (not a
 *      full-page navigation), and the panel carries a "Full view"
 *      button to enter the detail page.
 * 27 — ↑/↓ move the panel selection between assets while it's open.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CLIENT = 'src/app/t/[tenantSlug]/(app)/assets/AssetsClient.tsx';
const SHEET = 'src/app/t/[tenantSlug]/(app)/assets/AssetDetailSheet.tsx';

describe('item 34 — asset Criticality column', () => {
    const src = read(CLIENT);
    it('declares a criticality column derived from C/I/A', () => {
        expect(src).toMatch(/id:\s*'criticality'/);
        expect(src).toContain('getAssetCriticality(');
    });
});

describe('item 32 — single click opens the quick-look panel', () => {
    const src = read(CLIENT);
    it('row click opens the panel instead of navigating', () => {
        expect(src).toContain('onRowClick={(row) => setSelectedAssetId(row.original.id)}');
        // The old full-page navigation on row click is gone.
        expect(src).not.toMatch(/onRowClick=\{\(row\) => router\.push\(tenantHref\(`\/assets/);
    });
    it('mounts the AssetDetailSheet', () => {
        expect(src).toContain('<AssetDetailSheet');
    });
    it('the panel has a Full view button to the detail page', () => {
        const sheet = read(SHEET);
        expect(sheet).toContain('asset-sheet-full-view');
        expect(sheet).toMatch(/Full view/);
        expect(sheet).toMatch(/\/assets\/\$\{asset\.id\}/);
    });
});

describe('item 27 — arrow keys move between assets', () => {
    const src = read(CLIENT);
    it('registers ArrowDown / ArrowUp shortcuts gated on the open panel', () => {
        expect(src).toMatch(/useKeyboardShortcut\('ArrowDown'/);
        expect(src).toMatch(/useKeyboardShortcut\('ArrowUp'/);
        expect(src).toMatch(/enabled:\s*selectedAssetId != null/);
    });
});

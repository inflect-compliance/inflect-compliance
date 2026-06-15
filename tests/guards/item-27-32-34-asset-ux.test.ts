/**
 * Items 27 / 32 / 34 — asset list interaction ratchets.
 *
 * 34 — the asset table has a derived Criticality column.
 * 32 — three-way interaction: single-click TITLE → quick-look panel;
 *      single-click ROW → select (action row); double-click ROW → full
 *      detail page. The panel carries a "Full view" button too.
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

describe('item 32 — three-way asset interaction (title / row / double-click)', () => {
    const src = read(CLIENT);
    it('single-click on the TITLE opens the quick-look panel (title is a <button>)', () => {
        // A <button> so isClickOnInteractiveChild() skips the row's
        // select/navigate handlers — title clicks only open the panel.
        expect(src).toMatch(/<button[\s\S]{0,200}setSelectedAssetId\(row\.original\.id\)/);
        expect(src).toMatch(/data-testid=\{`asset-title-\$\{row\.original\.id\}`\}/);
    });
    it('single-click ROW selects (selectionEnabled on → action row replaces headers)', () => {
        // selectionEnabled on means single-click toggles the row's
        // selection (the SelectionToolbar appears); a regression back to
        // `selectionEnabled={false}` would make single-click navigate.
        expect(src).toContain('selectionEnabled');
        expect(src).not.toContain('selectionEnabled={false}');
    });
    it('double-click ROW opens the full detail page (onRowClick → navigate)', () => {
        // With selection on, onRowClick fires on DOUBLE click.
        expect(src).toMatch(/onRowClick=\{\(row\) =>\s*router\.push\(tenantHref\(`\/assets\/\$\{row\.original\.id\}`\)\)/);
        // The old single-click-opens-panel onRowClick is gone.
        expect(src).not.toContain('onRowClick={(row) => setSelectedAssetId(row.original.id)}');
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
    it('row title tints brand-color on row hover (TableTitleCell no-href branch)', () => {
        // Without href, TableTitleCell was a plain <span> with no
        // hover treatment, so the title text stayed static while the
        // row visibly hovered. The no-href branch now applies a
        // `group-hover/row:` brand-color transition so the title
        // signals clickability synchronously with the row.
        const titleCell = read('src/components/ui/table-title-cell.tsx');
        expect(titleCell).toMatch(/group-hover\/row:text-\[var\(--brand-default\)\]/);
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

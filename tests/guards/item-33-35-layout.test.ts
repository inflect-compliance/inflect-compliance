/**
 * Items 33 + 35 — layout responsiveness ratchets.
 *
 * 35 — table empty-state height. A row-less `<DataTable>` inside a
 *      detail-page tab is non-fillBody, so the empty-state floor is its
 *      ENTIRE height. The floor was `min-h-96` / `h-96` (384px), which
 *      reserved a huge empty block for a small panel. It is now
 *      `min-h-48` (192px) and can still grow via flex-1 on full-page
 *      (fillBody) tables.
 *
 * 33 — process-map canvas full-bleed. The AppShell content container
 *      caps every page at `max-w-7xl ... mx-auto`. The canvas editor
 *      route opts out so it spans the content area instead of floating
 *      centered in a reading column.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('item 35 — table empty-state is proportionate', () => {
    it('DataTable empty state floor is min-h-48, not min-h-96', () => {
        const src = read('src/components/ui/table/table.tsx');
        expect(src).toContain('flex flex-1 min-h-48 w-full');
        expect(src).not.toContain('flex flex-1 min-h-96 w-full');
    });

    it('TableEmptyState wrapper no longer hardcodes the 384px h-96', () => {
        const src = read('src/components/ui/table/table-empty-state.tsx');
        // Both render paths use a min-h-48 floor now.
        expect(src).not.toMatch(/flex h-96 w-full/);
        expect(src).toMatch(/min-h-48 w-full/);
    });
});

describe('item 33 — process canvas spans the page', () => {
    const appShell = read('src/components/layout/AppShell.tsx');

    it('AppShell detects the full-bleed canvas route', () => {
        expect(appShell).toContain('isCanvasFullBleed');
        // Scoped to the exact /processes route (sub-routes excluded).
        expect(appShell).toMatch(/\/\\\/processes\\\/\?\$\//);
    });

    it('the max-w reading column is gated OFF for the full-bleed route', () => {
        // The width cap + centering live only in the non-bleed branch.
        expect(appShell).toMatch(
            /isCanvasFullBleed[\s\S]{0,40}\?\s*null\s*:\s*'max-w-7xl/,
        );
    });
});

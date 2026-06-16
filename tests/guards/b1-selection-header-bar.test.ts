/**
 * B1 (2026-06-07) — the row-select action bar lives in the column-header
 * row, NOT a right-rail (Controls) or a standalone section (Tasks).
 *
 * The DataTable's `SelectionToolbar` already overlays the `<thead>` row
 * (absolute, top-0, z-30). B1:
 *   - Controls: the bulk actions render via the canonical <BulkActionBar>
 *     in the DataTable's `selectionControls` slot (header bar) — the same
 *     primitive Tasks/Assets use. This superseded the earlier three-verb
 *     `batchActions` (and the per-id N+1 status loop they drove) when the
 *     bar rolled out to all entities.
 *   - Tasks: the standalone `#bulk-toolbar` card moved into the DataTable's
 *     `selectionControls` (the inline form renders in the header bar).
 *   - The bar height now matches the header row (`h-9`, was `h-11` — it
 *     overhung the header by ~8px), and batch-action chips don't wrap.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const CONTROLS = read('src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx');
const TASKS = read('src/app/t/[tenantSlug]/(app)/tasks/TasksClient.tsx');
const TOOLBAR = read('src/components/ui/table/selection-toolbar.tsx');

describe('B1 — row-select action bar in the header row', () => {
    it('Controls renders the canonical BulkActionBar via selectionControls, NOT a selection right-rail', () => {
        expect(CONTROLS).toMatch(/selectionControls:\s*canEditControls/);
        expect(CONTROLS).toMatch(/<BulkActionBar\b/);
        expect(CONTROLS).toMatch(/actions=\{controlBulkActions\}/);
        // The selection-summary right-rail is gone.
        expect(CONTROLS).not.toMatch(/SelectionSummaryPanel/);
        // The former three-verb batchActions + per-id N+1 loop are gone.
        expect(CONTROLS).not.toMatch(/batchActions:\s*controlBatchActions/);
    });

    it('Tasks renders the bulk-edit form via selectionControls, NOT a standalone #bulk-toolbar', () => {
        expect(TASKS).toMatch(/selectionControls=\{\(\)\s*=>/);
        // The bulk-edit form is the canonical <BulkActionBar> (which carries
        // the #bulk-apply-btn); it's mounted in the selectionControls slot.
        expect(TASKS).toMatch(/<BulkActionBar\b/);
        const bar = read('src/components/ui/bulk-action-bar.tsx');
        expect(bar).toMatch(/id="bulk-apply-btn"/);
        // The standalone bulk-action card is gone.
        expect(TASKS).not.toMatch(/id="bulk-toolbar"/);
    });

    it('the selection toolbar matches the column-header row height (h-9, not h-11)', () => {
        expect(TOOLBAR).toMatch(/flex h-9 items-center/);
        expect(TOOLBAR).not.toMatch(/flex h-11 items-center/);
    });

    it('batch-action chips do not wrap (whitespace-nowrap) so they fit the slim bar', () => {
        expect(TOOLBAR).toMatch(/inline-flex items-center gap-1\.5 whitespace-nowrap/);
    });
});

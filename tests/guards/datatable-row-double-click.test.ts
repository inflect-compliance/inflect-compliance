/**
 * R13-PR2 — row-click semantics lock.
 *
 * The DataTable primitive opens a row on DOUBLE click, never on
 * single click. Rationale: the select column (R12-PR1) is now
 * default-on, so single click should remain available for
 * row-selection workflows (checkbox + shift-click). Double-click is
 * the unambiguous "open detail" gesture and matches the way users
 * already interact with file managers, mail clients, and most
 * spreadsheet-style tables.
 *
 * This guard locks the wiring on both row paths inside
 * `src/components/ui/table/table.tsx`:
 *
 *   1. The memoized `ResizableTableRow` (column-resizing on).
 *   2. The inline non-resizable `<tr>` (default).
 *
 * Both must wire `onRowClick` to `onDoubleClick`, and NEITHER may
 * wire `onRowClick` to a bare `onClick={` handler — that pattern
 * was the old single-click contract.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const TABLE_TSX = read('src/components/ui/table/table.tsx');
const VIRTUAL_TSX = read('src/components/ui/table/virtual-table-body.tsx');

describe('DataTable — row-click semantics (R13-PR2)', () => {
    it('wires onRowClick to onDoubleClick in all three row paths', () => {
        // table.tsx — resizable + non-resizable branches (2 matches).
        const tableMatches = TABLE_TSX.match(
            /onDoubleClick=\{\s*\n\s*onRowClick\s*\n\s*\?\s*\(e\)\s*=>/g,
        );
        expect(tableMatches).not.toBeNull();
        expect(tableMatches!.length).toBeGreaterThanOrEqual(2);

        // virtual-table-body.tsx — virtualized branch (1 match).
        const virtualMatches = VIRTUAL_TSX.match(
            /onDoubleClick=\{\s*\n\s*onRowClick\s*\n\s*\?\s*\(e\)\s*=>/g,
        );
        expect(virtualMatches).not.toBeNull();
        expect(virtualMatches!.length).toBeGreaterThanOrEqual(1);
    });

    it('never wires onRowClick to a bare onClick handler', () => {
        // The old contract was `onClick={ onRowClick ? (e) => ...`.
        // Any reappearance of that shape regresses the round.
        for (const src of [TABLE_TSX, VIRTUAL_TSX]) {
            expect(src).not.toMatch(
                /onClick=\{\s*\n\s*onRowClick\s*\n\s*\?\s*\(e\)\s*=>/,
            );
        }
    });

    it('preserves the hover-clickable affordance on every row path', () => {
        // `cursor-pointer select-none` must remain — three branches
        // (resizable, non-resizable, virtualized) must all signal
        // clickability.
        const cursorMatches = [
            ...TABLE_TSX.matchAll(
                /onRowClick\s*&&\s*\n?\s*"cursor-pointer\s+select-none/g,
            ),
            ...VIRTUAL_TSX.matchAll(
                /onRowClick\s*&&\s*\n?\s*"cursor-pointer\s+select-none/g,
            ),
        ];
        expect(cursorMatches.length).toBeGreaterThanOrEqual(3);
    });

    it('preserves the brand-coloured left-edge hover accent on every row path', () => {
        // R13-PR2 unified the brand-edge accent across all three
        // branches (resizable, non-resizable, virtualized). The
        // inset box-shadow trick keeps content from shifting on
        // hover.
        const tableAccents = TABLE_TSX.match(
            /hover:shadow-\[inset_2px_0_0_0?_var\(--brand-default\)\]/g,
        );
        const virtualAccents = VIRTUAL_TSX.match(
            /hover:shadow-\[inset_2px_0_0_0?_var\(--brand-default\)\]/g,
        );
        expect(tableAccents).not.toBeNull();
        expect(tableAccents!.length).toBeGreaterThanOrEqual(2);
        expect(virtualAccents).not.toBeNull();
        expect(virtualAccents!.length).toBeGreaterThanOrEqual(1);
    });
});

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
        // `cursor-pointer select-none` must remain on each row path
        // (resizable, non-resizable, virtualized) so users get a
        // hover signal that the row is interactive. R13-PR14
        // widened the gate from `onRowClick &&` to
        // `(onRowClick || selectionEnabled) &&` because a
        // selection-enabled row is now interactive even without an
        // explicit `onRowClick` — single click toggles selection.
        const gateRe =
            /\(\s*onRowClick\s*\|\|\s*selectionEnabled\s*\)\s*&&\s*\n?\s*"cursor-pointer\s+select-none/g;
        const cursorMatches = [
            ...TABLE_TSX.matchAll(gateRe),
            ...VIRTUAL_TSX.matchAll(gateRe),
        ];
        expect(cursorMatches.length).toBeGreaterThanOrEqual(3);
    });

    it('preserves the brand-coloured left-edge hover accent on every row path', () => {
        // R13-PR2 unified the brand-edge accent across all three
        // branches (resizable, non-resizable, virtualized).
        //
        // R13-PR13 moved the accent from the row's `hover:shadow-…`
        // to the FIRST cell's `group-hover/row:first-of-type:shadow-…`
        // because cell backgrounds (`bg-bg-muted` on hover) were
        // painting on top of the row-level shadow in the CSS table
        // model, making the accent flicker and disappear. Cell-
        // level shadow paints on the cell's own context — visible
        // for the entire hover lifetime.
        //
        // R13-PR15 replaced `:first-of-type` (CSS pseudo) with an
        // `isFirstContent` boolean passed at render time. The CSS
        // selector targeted the first `<td>` in each row, which
        // became the select column once R12-PR1 made selection
        // default-on — so the shadow rule never fired anywhere.
        // The recipe is now plain `group-hover/row:shadow-…`,
        // gated in JS to apply only to the first non-utility cell.
        const cellAccentRe =
            /group-hover\/row:shadow-\[inset_2px_0_0_var\(--brand-default\)\]/g;
        const tableMatches = TABLE_TSX.match(cellAccentRe);
        const virtualMatches = VIRTUAL_TSX.match(cellAccentRe);
        expect(tableMatches).not.toBeNull();
        expect(tableMatches!.length).toBeGreaterThanOrEqual(1);
        expect(virtualMatches).not.toBeNull();
        expect(virtualMatches!.length).toBeGreaterThanOrEqual(1);

        // The retired row-level `hover:shadow-…` must NOT come back
        // — re-introducing it triggers the flicker again. Strip
        // block + line comments first so the inline doc-comments
        // that mention the old pattern (for context) don't trip
        // the regression check.
        const stripComments = (src: string) =>
            src
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^[ \t]*\/\/.*$/gm, '');
        const oldRowRe =
            /\bhover:shadow-\[inset_2px_0_0_0?_var\(--brand-default\)\]/g;
        expect(stripComments(TABLE_TSX).match(oldRowRe)).toBeNull();
        expect(stripComments(VIRTUAL_TSX).match(oldRowRe)).toBeNull();

        // R13-PR15 — `:first-of-type` is gone (silently broke when
        // select column became default-on). Re-introducing it
        // would silently break the accent again.
        expect(stripComments(TABLE_TSX)).not.toMatch(
            /group-hover\/row:first-of-type:shadow-/,
        );
        expect(stripComments(VIRTUAL_TSX)).not.toMatch(
            /group-hover\/row:first-of-type:shadow-/,
        );
    });
});

/**
 * Universal column-sort ratchet.
 *
 * Clicking a column's sort arrow must order rows so same-DISPLAYED-value
 * rows are contiguous (grouped). The bug this guards against: a page
 * hand-rolls a `switch (sortBy)` comparator that sorts by a RAW field
 * while the column renders a derived/formatted value, interleaving the
 * groups. The fix is the shared `sortRowsByDisplay` helper, which sorts by
 * the column's displayed accessor.
 *
 * This ratchet enforces — for EVERY list page that exposes a
 * `sortableColumns` surface — that it routes its row sort through
 * `sortRowsByDisplay` and does NOT carry a bespoke `switch (sortBy)`
 * comparator. New tables are covered automatically (the scan is dynamic).
 *
 * The grouping behaviour itself is unit-tested in
 * `tests/unit/sort-rows-by-display.test.ts`.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.resolve(__dirname, '../../src/app');

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) out.push(...walk(abs));
        else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(abs);
    }
    return out;
}

/** Files that wire a client-side sortable table (the `sortableColumns` prop). */
function sortableTableFiles(): string[] {
    return walk(APP_DIR).filter((f) => {
        const src = fs.readFileSync(f, 'utf8');
        return /sortableColumns[=:]/.test(src);
    });
}

describe('universal column-sort: every sortable table groups by displayed value', () => {
    const files = sortableTableFiles();

    it('finds a non-trivial population of sortable list pages', () => {
        // Guards against the scan silently matching nothing.
        expect(files.length).toBeGreaterThanOrEqual(7);
    });

    it.each(files.map((f) => [path.relative(APP_DIR, f), f] as const))(
        '%s routes its row sort through sortRowsByDisplay',
        (_rel, file) => {
            const src = fs.readFileSync(file, 'utf8');
            expect(src).toMatch(/sortRowsByDisplay\s*\(/);
        },
    );

    it.each(files.map((f) => [path.relative(APP_DIR, f), f] as const))(
        '%s carries no hand-rolled `switch (sortBy)` comparator',
        (_rel, file) => {
            const src = fs.readFileSync(file, 'utf8');
            if (/switch\s*\(\s*sortBy\s*\)/.test(src)) {
                throw new Error(
                    `${path.relative(APP_DIR, file)} still hand-rolls a ` +
                        `\`switch (sortBy)\` comparator. Sort by the column's ` +
                        `displayed accessor via sortRowsByDisplay(rows, ` +
                        `sortAccessors, sortBy, sortOrder) so same-value rows ` +
                        `group contiguously — see ControlsClient.tsx.`,
                );
            }
        },
    );
});

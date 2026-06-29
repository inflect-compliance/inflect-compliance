/**
 * Unit tests for the universal list-table sort helper. The load-bearing
 * property is GROUPING: sorting by a column must place every row that
 * DISPLAYS the same value contiguously — the bug that motivated this
 * helper was Controls sorting by a raw field while the cell showed a
 * derived label, interleaving the groups.
 */
import { sortRowsByDisplay, type SortAccessors } from '@/components/ui/table/sort-rows';

interface Row {
    id: number;
    rawCategory: string | null;
    displayCategory: string; // what the cell renders (derived)
    score: number | null;
}

const accessors: SortAccessors<Row> = {
    category: (r) => r.displayCategory,
    score: (r) => r.score,
};

// Rows whose DISPLAYED category repeats across NON-ADJACENT raw values —
// exactly the shape that exposed the interleaving bug.
const rows: Row[] = [
    { id: 1, rawCategory: 'z9', displayCategory: 'Access control', score: 5 },
    { id: 2, rawCategory: 'a1', displayCategory: 'Operations security', score: 1 },
    { id: 3, rawCategory: 'm5', displayCategory: 'Access control', score: 9 },
    { id: 4, rawCategory: 'b2', displayCategory: 'Operations security', score: 3 },
    { id: 5, rawCategory: 'q7', displayCategory: 'Access control', score: 1 },
];

function categories(out: Row[]): string[] {
    return out.map((r) => r.displayCategory);
}

function isGrouped(values: string[]): boolean {
    // No value reappears after a different value has intervened.
    const seen = new Set<string>();
    let prev: string | null = null;
    for (const v of values) {
        if (v !== prev) {
            if (seen.has(v)) return false;
            seen.add(v);
        }
        prev = v;
    }
    return true;
}

describe('sortRowsByDisplay', () => {
    it('groups same-displayed-value rows contiguously (asc)', () => {
        const out = sortRowsByDisplay(rows, accessors, 'category', 'asc');
        expect(isGrouped(categories(out))).toBe(true);
        // ascending → Access control before Operations security
        expect(categories(out)).toEqual([
            'Access control',
            'Access control',
            'Access control',
            'Operations security',
            'Operations security',
        ]);
    });

    it('groups contiguously in desc too (groups reversed, not interleaved)', () => {
        const out = sortRowsByDisplay(rows, accessors, 'category', 'desc');
        expect(isGrouped(categories(out))).toBe(true);
        expect(categories(out)).toEqual([
            'Operations security',
            'Operations security',
            'Access control',
            'Access control',
            'Access control',
        ]);
    });

    it('is stable within a group (preserves input order for equal keys)', () => {
        const out = sortRowsByDisplay(rows, accessors, 'category', 'asc');
        const accessIds = out.filter((r) => r.displayCategory === 'Access control').map((r) => r.id);
        expect(accessIds).toEqual([1, 3, 5]); // original relative order
    });

    it('sorts numbers numerically (not lexicographically)', () => {
        const nums: Row[] = [
            { id: 1, rawCategory: null, displayCategory: '', score: 10 },
            { id: 2, rawCategory: null, displayCategory: '', score: 2 },
            { id: 3, rawCategory: null, displayCategory: '', score: 100 },
        ];
        const out = sortRowsByDisplay(nums, accessors, 'score', 'asc');
        expect(out.map((r) => r.score)).toEqual([2, 10, 100]);
    });

    it('keeps nullish/empty values grouped at one end', () => {
        const mixed: Row[] = [
            { id: 1, rawCategory: null, displayCategory: 'B', score: 1 },
            { id: 2, rawCategory: null, displayCategory: '', score: 1 },
            { id: 3, rawCategory: null, displayCategory: 'A', score: 1 },
            { id: 4, rawCategory: null, displayCategory: '', score: 1 },
        ];
        const out = sortRowsByDisplay(mixed, accessors, 'category', 'asc');
        // the two empties stay adjacent (grouped), real values sorted before them
        expect(categories(out)).toEqual(['A', 'B', '', '']);
    });

    it('returns the input unchanged when there is no active sort or unknown column', () => {
        expect(sortRowsByDisplay(rows, accessors, undefined, 'asc')).toBe(rows);
        expect(sortRowsByDisplay(rows, accessors, 'nonexistent', 'asc')).toBe(rows);
    });
});

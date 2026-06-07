/**
 * checklist-order — the shared click-to-order model (2026-06-07).
 *
 * Pure-function unit tests for the visibility + ordering transforms that
 * both gear hooks (useFilterCardVisibility + useColumnsDropdown) stand on.
 */
import {
    applySlotOrder,
    buildChecklistItems,
    defaultOrder,
    isModifiedFromDefault,
    reconcileOrder,
    toggleOrder,
    type ChecklistDef,
} from '@/components/ui/checklist-order';

const DEFS: ChecklistDef[] = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
];

describe('checklist-order', () => {
    it('defaultOrder is every def in declaration order', () => {
        expect(defaultOrder(DEFS)).toEqual(['a', 'b', 'c']);
    });

    describe('toggleOrder (click-to-order)', () => {
        it('appends a hidden id to the END (next number)', () => {
            expect(toggleOrder(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
        });
        it('removes a visible id (the rest renumber implicitly)', () => {
            expect(toggleOrder(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
        });
        it('re-showing a toggled-off id puts it back at the end', () => {
            const off = toggleOrder(['a', 'b', 'c'], 'a'); // ['b','c']
            expect(toggleOrder(off, 'a')).toEqual(['b', 'c', 'a']);
        });
    });

    describe('isModifiedFromDefault', () => {
        const def = ['a', 'b', 'c'];
        it('false when identical', () => {
            expect(isModifiedFromDefault(['a', 'b', 'c'], def)).toBe(false);
        });
        it('true when an item is hidden', () => {
            expect(isModifiedFromDefault(['a', 'c'], def)).toBe(true);
        });
        it('true when reordered (same set, different order)', () => {
            expect(isModifiedFromDefault(['b', 'a', 'c'], def)).toBe(true);
        });
    });

    describe('reconcileOrder', () => {
        it('drops ids no longer present', () => {
            expect(reconcileOrder(['a', 'x', 'b'], DEFS)).toEqual(['a', 'b']);
        });
        it('does NOT re-add defs absent from the order (respects user hiding)', () => {
            // 'c' is absent because the user hid it — reconcile must NOT
            // re-show it (the un-hide-on-reload bug). New defs surface as
            // toggleable-off rows via buildChecklistItems instead.
            expect(reconcileOrder(['a', 'b'], DEFS)).toEqual(['a', 'b']);
        });
        it('returns the SAME array identity when nothing changed (stable for memo)', () => {
            const order = ['a', 'b', 'c'];
            expect(reconcileOrder(order, DEFS)).toBe(order);
        });
        it('falls back to default order when handed a non-array (legacy VisibilityState object)', () => {
            // Pre-gear localStorage held `{ id: bool }`; reusing the key
            // means we can be handed that object. Must NOT crash on .filter.
            const legacy = { a: true, b: false } as unknown as string[];
            expect(reconcileOrder(legacy, DEFS)).toEqual(['a', 'b', 'c']);
        });
    });

    describe('buildChecklistItems', () => {
        it('visible items first (numbered 1..k), then hidden (no number)', () => {
            const items = buildChecklistItems(DEFS, ['c', 'a']);
            expect(items).toEqual([
                { id: 'c', label: 'Gamma', visible: true, order: 1 },
                { id: 'a', label: 'Alpha', visible: true, order: 2 },
                { id: 'b', label: 'Beta', visible: false, order: null },
            ]);
        });
    });

    describe('applySlotOrder (column slot-merge)', () => {
        type Col = { id?: string; accessorKey?: string };
        const cols: Col[] = [
            { id: 'select' }, // fixed (not in order)
            { id: 'code' },
            { accessorKey: 'name' }, // id derived from accessorKey
            { id: 'status' },
            { id: 'actions' }, // fixed (not in order)
        ];

        it('reorders managed columns within their slots; fixed columns stay put', () => {
            // Reorder the three managed columns: status, code, name.
            const out = applySlotOrder(cols, ['status', 'code', 'name']);
            expect(out.map((c) => c.id ?? c.accessorKey)).toEqual([
                'select', // fixed — unmoved
                'status', // slot 1 (was code's index)
                'code', // slot 2
                'name', // slot 3
                'actions', // fixed — unmoved
            ]);
        });

        it('leaves columns untouched when order matches', () => {
            const out = applySlotOrder(cols, ['code', 'name', 'status']);
            expect(out).toEqual(cols);
        });
    });
});

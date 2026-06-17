/** @jest-environment jsdom */

/**
 * Behavioural ratchet — `<DataTable onRowPrefetch>` warms a row's detail route
 * on pointer-enter (instant-navigation work).
 *
 * Contract: hovering a row fires `onRowPrefetch(row)` once, deduped per row
 * (so repeated hovers don't re-fire). The callback lives in the CONSUMER
 * (which holds the router and does `router.prefetch`), so the table primitive
 * has NO `useRouter` dependency — a DataTable renders fine without an
 * app-router context. That last property is asserted explicitly: this file
 * deliberately does NOT mock `next/navigation`.
 */

import { render, fireEvent } from '@testing-library/react';
import * as React from 'react';

import { DataTable, createColumns } from '@/components/ui/table';

interface Row {
    id: string;
    name: string;
}

const rows: Row[] = [
    { id: 'r0', name: 'Alpha' },
    { id: 'r1', name: 'Beta' },
];

const columns = createColumns<Row>([{ accessorKey: 'name', header: 'Name' }]);

function renderTable(onRowPrefetch: (row: { original: Row }) => void) {
    return render(
        <DataTable<Row>
            data={rows}
            columns={columns}
            getRowId={(r) => r.id}
            onRowPrefetch={onRowPrefetch}
        />,
    );
}

function rowByText(container: HTMLElement, label: string): HTMLElement {
    const cell = Array.from(container.querySelectorAll('td')).find((td) =>
        td.textContent?.includes(label),
    );
    const tr = cell?.closest('tr');
    if (!tr) throw new Error(`row "${label}" not found`);
    return tr as HTMLElement;
}

describe('DataTable onRowPrefetch — hover warms the detail route', () => {
    it('fires onRowPrefetch on first pointer-enter, with the hovered row', () => {
        const spy = jest.fn();
        const { container } = renderTable(spy);
        fireEvent.mouseEnter(rowByText(container, 'Alpha'));
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0].original.id).toBe('r0');
    });

    it('fires at most once per row (deduped across repeated hovers)', () => {
        const spy = jest.fn();
        const { container } = renderTable(spy);
        const alpha = rowByText(container, 'Alpha');
        fireEvent.mouseEnter(alpha);
        fireEvent.mouseEnter(alpha);
        fireEvent.mouseEnter(alpha);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('renders without an app-router context — the primitive has no useRouter', () => {
        // No `jest.mock('next/navigation')` in this file: if DataTable called
        // useRouter, this render would throw "invariant expected app router to
        // be mounted". It must not.
        expect(() => renderTable(jest.fn())).not.toThrow();
    });
});

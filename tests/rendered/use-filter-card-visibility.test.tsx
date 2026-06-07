/**
 * useFilterCardVisibility — hook behaviour (2026-06-07).
 *
 * Covers the filter-card gear state: default-all-visible, the rendered
 * gear, click-to-order toggling, selectVisibleFilters projection, and the
 * forward-compat CardDefinition `kind` discriminator.
 */
import * as React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
    useFilterCardVisibility,
    filtersToCards,
    selectVisibleFilters,
    type CardDefinition,
} from '@/components/ui/filter/use-filter-card-visibility';
import type { Filter as FilterType } from '@/components/ui/filter/types';

const FILTERS = [
    { key: 'status', label: 'Status', icon: null, options: null },
    { key: 'owner', label: 'Owner', icon: null, options: null },
] as unknown as FilterType[];

const CARDS: CardDefinition[] = [
    { id: 'status', label: 'Status', kind: 'filter' },
    { id: 'owner', label: 'Owner', kind: 'filter' },
];

describe('useFilterCardVisibility', () => {
    it('starts with all cards visible, in order', () => {
        const { result } = renderHook(() =>
            useFilterCardVisibility({
                storageKey: 'test:filter-vis:a',
                cards: CARDS,
            }),
        );
        expect(result.current.visibleCards.map((c) => c.id)).toEqual([
            'status',
            'owner',
        ]);
    });

    it('renders the filter gear', () => {
        function Harness() {
            const { dropdown } = useFilterCardVisibility({
                storageKey: 'test:filter-vis:b',
                cards: CARDS,
            });
            return <div>{dropdown}</div>;
        }
        render(<Harness />);
        expect(screen.getByTestId('edit-filters-button')).toBeInTheDocument();
    });

    it('filtersToCards maps FilterType[] to kind:filter cards', () => {
        const cards = filtersToCards(FILTERS);
        expect(cards).toEqual([
            { id: 'status', label: 'Status', icon: undefined, kind: 'filter' },
            { id: 'owner', label: 'Owner', icon: undefined, kind: 'filter' },
        ]);
    });

    it('selectVisibleFilters projects visible cards back onto FilterType[] in order', () => {
        const visible: CardDefinition[] = [
            { id: 'owner', label: 'Owner', kind: 'filter' },
        ];
        const out = selectVisibleFilters(visible, FILTERS);
        expect(out.map((f) => f.key)).toEqual(['owner']);
    });

    it('hides a card when toggled off and re-projects', () => {
        const { result } = renderHook(() =>
            useFilterCardVisibility({
                storageKey: 'test:filter-vis:c',
                cards: CARDS,
            }),
        );
        // Pull the onToggle out of the rendered dropdown's props.
        const dropdown = result.current.dropdown as React.ReactElement<{
            onToggle: (id: string) => void;
        }>;
        act(() => dropdown.props.onToggle('status'));
        expect(result.current.visibleCards.map((c) => c.id)).toEqual(['owner']);
    });
});

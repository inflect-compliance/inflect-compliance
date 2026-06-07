/**
 * checklist-gear-primitive — rendered behaviour (2026-06-07).
 *
 * The shared <ChecklistGearButton> trigger exposes the test-id + accessible
 * name, rings when modified, and the two differentiated gears (Edit filter
 * cards = Settings, Toggle columns = Columns3) render side by side. The
 * structural locks live in `tests/guards/checklist-gear-primitive.test.ts`.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { ChecklistGearButton } from '@/components/ui/checklist-gear-button';
import { EditFiltersButton } from '@/components/ui/filter/edit-filters-button';
import { ColumnsDropdown } from '@/components/ui/table/columns-dropdown';
import type { ChecklistGearItem } from '@/components/ui/checklist-order';

const ITEMS: ChecklistGearItem[] = [
    { id: 'a', label: 'Alpha', visible: true, order: 1 },
    { id: 'b', label: 'Beta', visible: true, order: 2 },
    { id: 'c', label: 'Gamma', visible: false, order: null },
];

describe('ChecklistGearButton (rendered)', () => {
    it('exposes the test-id + accessible name on the trigger', () => {
        render(
            <ChecklistGearButton
                items={ITEMS}
                onToggle={() => {}}
                someModified={false}
                title="Edit X"
                icon={<svg aria-hidden="true" />}
                data-testid="x-btn"
            />,
        );
        expect(screen.getByTestId('x-btn')).toHaveAttribute(
            'aria-label',
            'Edit X',
        );
    });

    it('rings the trigger when someModified is true', () => {
        render(
            <ChecklistGearButton
                items={ITEMS}
                onToggle={() => {}}
                someModified
                title="Edit X"
                icon={<svg aria-hidden="true" />}
                data-testid="ring-btn"
            />,
        );
        expect(screen.getByTestId('ring-btn').className).toMatch(/ring-1/);
    });

    it('renders the two differentiated gears side by side', () => {
        render(
            <div>
                <EditFiltersButton
                    items={ITEMS}
                    onToggle={() => {}}
                    someModified={false}
                />
                <ColumnsDropdown
                    items={ITEMS}
                    onToggle={() => {}}
                    someModified={false}
                />
            </div>,
        );
        expect(screen.getByTestId('edit-filters-button')).toBeInTheDocument();
        expect(screen.getByTestId('toggle-columns-button')).toBeInTheDocument();
    });
});

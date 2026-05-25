/**
 * Locks the regression class for the "Edit columns button doesn't
 * work" user report.
 *
 * Root cause: the prior `<Popover><Tooltip><Button/></Tooltip></Popover>`
 * composition silently swallowed the props that Radix's
 * `Popover.Trigger asChild` injected onto its child — Tooltip
 * (a function component) received them and dropped them. The
 * gear rendered visually but had no onClick, no aria-expanded,
 * no aria-haspopup. Clicking did nothing.
 *
 * Fix: the gear trigger renders Button directly inside Popover,
 * with `title` providing the native hover hint instead of a
 * wrapping Tooltip. This test asserts the Radix-injected trigger
 * props (aria-expanded / aria-haspopup) DO land on the rendered
 * button, and that clicking flips aria-expanded → "true".
 *
 * If a future refactor wraps the gear in `<Tooltip>` again, this
 * test fails — surfacing the regression class loudly.
 */
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useColumnsDropdown } from '@/components/ui/table/use-columns-dropdown';

function Harness() {
    const { dropdown } = useColumnsDropdown({
        storageKey: 'test:col-vis:click',
        columns: [
            { id: 'a', label: 'Apple' },
            { id: 'b', label: 'Banana' },
        ],
    });
    return <div>{dropdown}</div>;
}

describe('Edit columns button — click opens the popover', () => {
    test('Radix Popover.Trigger props land on the rendered button', () => {
        render(<Harness />);
        const gear = screen.getByTestId('edit-columns-button');
        // The Radix-injected trigger props must be present — they
        // are what makes the button function as a popover trigger.
        expect(gear).toHaveAttribute('aria-expanded', 'false');
        expect(gear).toHaveAttribute('aria-haspopup');
    });

    test('clicking the gear flips aria-expanded to true', () => {
        render(<Harness />);
        const gear = screen.getByTestId('edit-columns-button');
        fireEvent.click(gear);
        expect(gear).toHaveAttribute('aria-expanded', 'true');
    });
});

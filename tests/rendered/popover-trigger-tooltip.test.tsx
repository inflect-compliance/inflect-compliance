/**
 * UI-20 — canonical tooltip on a Popover trigger.
 *
 * Regression proof for the composition behind the column/filter gears: a
 * `<Popover triggerTooltip="…">` wraps its trigger child in <Tooltip> INSIDE
 * the asChild Trigger. The historical trap was that nesting <Tooltip> swallowed
 * the Popover's injected onClick and the trigger went dead ("gear doesn't open").
 *
 * The Tooltip primitive now forwards trigger-injected props, so clicking the
 * trigger STILL opens the popover. This test would fail (content never appears)
 * if that forwarding regressed.
 */
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Popover } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';

function Harness({ tooltip }: { tooltip?: string }) {
    const [open, setOpen] = useState(false);
    return (
        <TooltipProvider>
            <Popover
                openPopover={open}
                setOpenPopover={setOpen}
                forceDropdown
                triggerTooltip={tooltip}
                content={<div>PANEL_CONTENT</div>}
            >
                <button type="button">Open gear</button>
            </Popover>
        </TooltipProvider>
    );
}

describe('UI-20 — Popover triggerTooltip composition', () => {
    it('opens the popover on trigger click WITH a trigger tooltip set', () => {
        render(<Harness tooltip="Toggle columns" />);
        expect(screen.queryByText('PANEL_CONTENT')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open gear' }));
        // If the Tooltip swallowed the Popover's onClick the panel would never
        // mount — its presence proves the open handler reached the trigger.
        expect(screen.getByText('PANEL_CONTENT')).toBeInTheDocument();
    });

    it('still opens when NO tooltip is set (baseline, unwrapped trigger)', () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: 'Open gear' }));
        expect(screen.getByText('PANEL_CONTENT')).toBeInTheDocument();
    });
});

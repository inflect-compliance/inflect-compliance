/**
 * VR-2 — the palette's Automation section is gated by canvas mode.
 *
 * In DOCUMENT mode the automation node stamps are absent; in AUTOMATION
 * mode they render as a dedicated section.
 */
import { render } from '@testing-library/react';
import * as React from 'react';
import { ProcessPalette } from '@/components/processes/ProcessPalette';
import { CanvasModeProvider } from '@/lib/processes/canvas-mode-context';

function renderInMode(mode: 'DOCUMENT' | 'AUTOMATION') {
    return render(
        <CanvasModeProvider mode={mode}>
            <ProcessPalette />
        </CanvasModeProvider>,
    );
}

describe('ProcessPalette automation gating', () => {
    it('hides the automation section in DOCUMENT mode', () => {
        const { container } = renderInMode('DOCUMENT');
        expect(
            container.querySelector('[data-process-palette-category="automation"]'),
        ).toBeNull();
        // automation stamps absent
        expect(container.querySelector('[data-palette-item="trigger"]')).toBeNull();
    });

    it('renders the automation section in AUTOMATION mode', () => {
        const { container } = renderInMode('AUTOMATION');
        expect(
            container.querySelector('[data-process-palette-category="automation"]'),
        ).not.toBeNull();
        for (const kind of ['trigger', 'condition', 'action', 'slaGate']) {
            expect(
                container.querySelector(`[data-palette-item="${kind}"]`),
            ).not.toBeNull();
        }
    });

    it('still renders the document flow section in both modes', () => {
        for (const mode of ['DOCUMENT', 'AUTOMATION'] as const) {
            const { container } = renderInMode(mode);
            expect(
                container.querySelector('[data-process-palette-category="flow"]'),
            ).not.toBeNull();
        }
    });
});

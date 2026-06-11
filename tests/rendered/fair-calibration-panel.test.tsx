/**
 * RQ2-7 — FairAnalysisPanel calibration aids rendered tests.
 *
 * Locks: live reflections beside the inputs, warn-only sanity
 * notices (save stays enabled), and the per-category prior ghost
 * text — plus the zero-cost default for blank/unknown inputs.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';

jest.mock('@/lib/tenant-context-provider', () => ({
    useTenantApiUrl: () => (p: string) => `/api/t/acme${p}`,
}));

import { FairAnalysisPanel, type FairInitial } from '@/app/t/[tenantSlug]/(app)/risks/[riskId]/FairAnalysisPanel';

const BLANK: FairInitial = {
    threatEventFrequency: null,
    contactFrequency: null,
    probabilityOfAction: null,
    vulnerabilityProbability: null,
    threatCapability: null,
    controlStrength: null,
    primaryLossMagnitude: null,
    productivityLoss: null,
    responseCost: null,
    replacementCost: null,
    secondaryLossEventFrequency: null,
    secondaryLossMagnitude: null,
    fairConfidence: null,
};

describe('FairAnalysisPanel — calibration aids', () => {
    it('blank inputs render no reflections, no warnings, no prior (zero-cost default)', () => {
        render(<FairAnalysisPanel riskId="r-1" initial={BLANK} />);
        expect(screen.queryAllByTestId(/fair-reflection-/)).toHaveLength(0);
        expect(screen.queryByTestId('fair-calibration-warnings')).toBeNull();
        expect(screen.queryByTestId('fair-prior-hint')).toBeNull();
    });

    it('a populated TEF renders its plain-language reflection live', () => {
        render(
            <FairAnalysisPanel
                riskId="r-1"
                initial={{ ...BLANK, threatEventFrequency: 0.1 }}
            />,
        );
        expect(screen.getByTestId('fair-reflection-threatEventFrequency').textContent).toMatch(
            /every 10 years/,
        );
    });

    it('an out-of-range probability warns but the save button stays enabled', () => {
        render(
            <FairAnalysisPanel
                riskId="r-1"
                initial={{ ...BLANK, vulnerabilityProbability: 1.4 }}
            />,
        );
        expect(screen.getByTestId('fair-calibration-warnings').textContent).toMatch(
            /probability — expected 0–1/,
        );
        const save = screen.getByText('Save FAIR inputs').closest('button')!;
        expect(save).not.toBeDisabled();
    });

    it('warnings update live as the user types', () => {
        render(<FairAnalysisPanel riskId="r-1" initial={BLANK} />);
        const inputs = screen.getAllByRole('textbox');
        // P(action) is the second input in the TEF group.
        fireEvent.change(inputs[1], { target: { value: '5' } });
        expect(screen.getByTestId('fair-calibration-warnings').textContent).toMatch(
            /probabilityOfAction/,
        );
        fireEvent.change(inputs[1], { target: { value: '0.5' } });
        expect(screen.queryByTestId('fair-calibration-warnings')).toBeNull();
    });

    it('a known category renders both prior anchors as ghost text', () => {
        render(<FairAnalysisPanel riskId="r-1" initial={BLANK} category="Technical" />);
        const hints = screen.getAllByTestId('fair-prior-hint');
        expect(hints).toHaveLength(2);
        expect(hints[0].textContent).toMatch(/ransomware/i);
    });

    it('an unknown category renders no prior (anchors, not noise)', () => {
        render(<FairAnalysisPanel riskId="r-1" initial={BLANK} category="Quantum" />);
        expect(screen.queryByTestId('fair-prior-hint')).toBeNull();
    });
});

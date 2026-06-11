/**
 * polish #15 — assessment-panel save-conflict warning.
 *
 * If the user opens a manual residual draft and then saves a new
 * inherent assessment, the draft now applies to a DIFFERENT
 * inherent baseline. The panel must warn before the residual save,
 * not silently rebase the conclusion.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';

jest.mock('@/lib/tenant-context-provider', () => ({
    useTenantApiUrl: () => (p: string) => `/api/t/acme${p}`,
}));

import { RiskAssessmentPanel, type AssessmentRisk } from '@/app/t/[tenantSlug]/(app)/risks/[riskId]/RiskAssessmentPanel';

const MATRIX = {
    likelihoodLevels: 5,
    impactLevels: 5,
    axisLikelihoodLabel: 'Likelihood',
    axisImpactLabel: 'Impact',
    levelLabels: { likelihood: ['1', '2', '3', '4', '5'], impact: ['1', '2', '3', '4', '5'] },
    bands: [{ name: 'Low', minScore: 1, maxScore: 6, color: '#22c55e' }],
};
const SUGGESTION = {
    riskId: 'r-1',
    inherent: { likelihood: 4, impact: 5, score: 20 },
    current: { residualLikelihood: null, residualImpact: null, residualScore: null },
    suggestion: null,
    combined: { likelihoodReduction: 0, impactReduction: 0, participatingCount: 0, contributions: [] },
    summary: 'No linked controls carry an effectiveness signal yet',
};
const BASE: AssessmentRisk = {
    likelihood: 4, impact: 5, inherentScore: 20,
    residualLikelihood: null, residualImpact: null, residualScore: null,
};

function mockFetch() {
    return jest.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/risk-matrix-config')) return { ok: true, json: async () => MATRIX };
        if (url.includes('/residual-suggestion')) return { ok: true, json: async () => SUGGESTION };
        if (init?.method === 'PUT') return { ok: true, json: async () => ({ success: true }) };
        throw new Error(`Unexpected fetch: ${url}`);
    });
}

describe('assessment panel — save-conflict warning', () => {
    it('saving inherent while a residual draft is open surfaces a baseline warning', async () => {
        global.fetch = mockFetch() as unknown as typeof fetch;
        render(
            <RiskAssessmentPanel
                riskId="r-1"
                risk={BASE}
                canWrite
                onRiskUpdated={() => {}}
                onQuantify={() => {}}
                onLinkControls={() => {}}
            />,
        );
        await waitFor(() =>
            expect(screen.getByText(/1 · Inherent assessment/)).toBeInTheDocument(),
        );

        // Open the manual residual draft.
        // Dirty the inherent step BEFORE opening the residual draft:
        // the "Save assessment" button needs an inherent-dirty state.
        // Each NumberStepper has its own Increase/Decrease pair —
        // the inherent likelihood is the FIRST in DOM order.
        const incButtons = screen.getAllByLabelText('Increase');
        fireEvent.click(incButtons[0]);
        // Open the manual residual draft.
        fireEvent.click(screen.getByText('Assess residual manually'));
        expect(screen.queryByTestId('residual-baseline-warning')).toBeNull();
        // Save inherent now that the residual override panel is open.
        fireEvent.click(await screen.findByText('Save assessment'));

        await waitFor(() =>
            expect(screen.getByTestId('residual-baseline-warning')).toBeInTheDocument(),
        );
        expect(screen.getByTestId('residual-baseline-warning').textContent).toMatch(
            /Inherent has changed/,
        );
    });

    it('canceling the residual draft clears the warning', async () => {
        global.fetch = mockFetch() as unknown as typeof fetch;
        render(
            <RiskAssessmentPanel
                riskId="r-1"
                risk={BASE}
                canWrite
                onRiskUpdated={() => {}}
                onQuantify={() => {}}
                onLinkControls={() => {}}
            />,
        );
        await waitFor(() =>
            expect(screen.getByText(/1 · Inherent assessment/)).toBeInTheDocument(),
        );
        fireEvent.click(screen.getAllByLabelText('Increase')[0]);
        fireEvent.click(screen.getByText('Assess residual manually'));
        fireEvent.click(await screen.findByText('Save assessment'));
        await waitFor(() =>
            expect(screen.getByTestId('residual-baseline-warning')).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByText('Cancel'));
        expect(screen.queryByTestId('residual-baseline-warning')).toBeNull();
    });
});

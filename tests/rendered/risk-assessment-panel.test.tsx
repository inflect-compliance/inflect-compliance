/**
 * RQ2-4 — RiskAssessmentPanel rendered tests.
 *
 * Locks the panel's behavioural contract:
 *   - level steppers speak the tenant's matrix language (labels from
 *     the fetched RiskMatrixConfig, band chip from the canonical
 *     resolver);
 *   - the control-derivation breakdown renders participating AND
 *     excluded controls (the data-quality nudge stays visible);
 *   - "Accept suggestion" POSTs ONLY a justification (server-side
 *     recompute — the RQ2-2 contract);
 *   - the asserted-vs-suggested cards render side by side, with the
 *     legacy-undecomposed message for divisor-era residuals;
 *   - the quantify + link-controls bridges fire their callbacks;
 *   - read-only users get no mutation affordances.
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
    levelLabels: {
        likelihood: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'],
        impact: ['Negligible', 'Minor', 'Moderate', 'Major', 'Severe'],
    },
    bands: [
        { name: 'Low', minScore: 1, maxScore: 6, color: '#22c55e' },
        { name: 'Medium', minScore: 7, maxScore: 14, color: '#eab308' },
        { name: 'High', minScore: 15, maxScore: 25, color: '#ef4444' },
    ],
};

const SUGGESTION = {
    riskId: 'r-1',
    inherent: { likelihood: 4, impact: 5, score: 20 },
    current: { residualLikelihood: null, residualImpact: null, residualScore: null },
    suggestion: {
        residualLikelihood: 2,
        residualImpact: 4,
        residualScore: 8,
        likelihoodReduction: 0.6,
        impactReduction: 0.3,
    },
    combined: {
        likelihoodReduction: 0.6,
        impactReduction: 0.3,
        participatingCount: 2,
        contributions: [
            {
                controlId: 'c-1', code: 'AC-1', name: 'MFA everywhere',
                mitigationType: 'PREVENTIVE', effectiveness: 60,
                source: 'MEASURED', affects: 'LIKELIHOOD', excludedReason: null,
            },
            {
                controlId: 'c-2', code: 'IR-2', name: 'Incident response',
                mitigationType: 'CORRECTIVE', effectiveness: 30,
                source: 'DECLARED', affects: 'IMPACT', excludedReason: null,
            },
            {
                controlId: 'c-3', code: null, name: 'Unscored control',
                mitigationType: 'PREVENTIVE', effectiveness: null,
                source: null, affects: null, excludedReason: 'NO_EFFECTIVENESS',
            },
        ],
    },
    summary: '1 likelihood-reducing control → 60% combined likelihood reduction; 1 impact-reducing control → 30% impact reduction',
};

const BASE_RISK: AssessmentRisk = {
    likelihood: 4,
    impact: 5,
    inherentScore: 20,
    residualLikelihood: null,
    residualImpact: null,
    residualScore: null,
};

let fetchMock: jest.Mock;

function mockFetchRoutes(over: { suggestion?: unknown } = {}) {
    fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/risk-matrix-config')) {
            return { ok: true, json: async () => MATRIX };
        }
        if (url.includes('/residual-suggestion')) {
            if (init?.method === 'POST') {
                return { ok: true, json: async () => ({ success: true }) };
            }
            return { ok: true, json: async () => over.suggestion ?? SUGGESTION };
        }
        if (init?.method === 'PUT') {
            return { ok: true, json: async () => ({ success: true }) };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
}

const noop = () => {};

async function renderPanel(props: Partial<React.ComponentProps<typeof RiskAssessmentPanel>> = {}) {
    render(
        <RiskAssessmentPanel
            riskId="r-1"
            risk={BASE_RISK}
            canWrite
            onRiskUpdated={noop}
            onQuantify={noop}
            onLinkControls={noop}
            {...props}
        />,
    );
    await waitFor(() => expect(screen.getByText(/1 · Inherent assessment/)).toBeInTheDocument());
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFetchRoutes();
});

describe('RiskAssessmentPanel — tenant matrix language', () => {
    it('steppers render the tenant level labels and a live band chip', async () => {
        await renderPanel();
        expect(screen.getByText('4 — Likely')).toBeInTheDocument();
        expect(screen.getByText('5 — Severe')).toBeInTheDocument();
        // 4 × 5 = 20 → High band from the config.
        expect(screen.getAllByText(/20 · High/).length).toBeGreaterThan(0);
    });

    it('renders participating controls with source + dimension, and the excluded nudge', async () => {
        await renderPanel();
        expect(screen.getByText(/AC-1 — MFA everywhere/)).toBeInTheDocument();
        expect(screen.getByText(/measured from tests/)).toBeInTheDocument();
        expect(screen.getByText(/IR-2 — Incident response/)).toBeInTheDocument();
        expect(screen.getByText(/declared/)).toBeInTheDocument();
        expect(screen.getByText(/Unscored control/)).toBeInTheDocument();
        expect(screen.getByText(/no effectiveness signal/)).toBeInTheDocument();
    });
});

describe('RiskAssessmentPanel — residual flow', () => {
    it('accept POSTs only a justification (server-side recompute)', async () => {
        await renderPanel();
        fireEvent.click(screen.getByText('Accept suggestion'));
        await waitFor(() => {
            const post = fetchMock.mock.calls.find(
                ([url, init]: [string, RequestInit?]) =>
                    url.includes('/residual-suggestion') && init?.method === 'POST',
            );
            expect(post).toBeDefined();
            const body = JSON.parse(post![1].body as string);
            expect(Object.keys(body)).toEqual(['justification']);
        });
    });

    it('manual override PUTs decomposed dims + scoreJustification, never a rollup', async () => {
        await renderPanel();
        fireEvent.click(screen.getByText('Assess residual manually'));
        fireEvent.change(screen.getByPlaceholderText(/Why this residual differs/), {
            target: { value: 'transferred via cyber insurance' },
        });
        fireEvent.click(screen.getByText('Save residual'));
        await waitFor(() => {
            const put = fetchMock.mock.calls.find(
                ([url, init]: [string, RequestInit?]) =>
                    url.endsWith('/risks/r-1') && init?.method === 'PUT',
            );
            expect(put).toBeDefined();
            const body = JSON.parse(put![1].body as string);
            expect(body).toMatchObject({
                residualLikelihood: 4,
                residualImpact: 5,
                scoreJustification: 'transferred via cyber insurance',
            });
            expect(body.residualScore).toBeUndefined();
        });
    });

    it('legacy undecomposed residuals get the honest message', async () => {
        await renderPanel({
            risk: { ...BASE_RISK, residualScore: 4, residualLikelihood: null, residualImpact: null },
        });
        expect(screen.getByText(/Set before decomposition/)).toBeInTheDocument();
    });

    it('read-only users see no mutation affordances', async () => {
        await renderPanel({ canWrite: false });
        expect(screen.queryByText('Accept suggestion')).toBeNull();
        expect(screen.queryByText('Assess residual manually')).toBeNull();
    });
});

describe('RiskAssessmentPanel — bridges', () => {
    it('the quantify bridge fires its callback', async () => {
        const onQuantify = jest.fn();
        await renderPanel({ onQuantify });
        fireEvent.click(screen.getByText('Quantify this risk'));
        expect(onQuantify).toHaveBeenCalled();
    });

    it('with zero linked controls, the link-controls bridge renders and fires', async () => {
        mockFetchRoutes({
            suggestion: {
                ...SUGGESTION,
                suggestion: null,
                combined: { likelihoodReduction: 0, impactReduction: 0, participatingCount: 0, contributions: [] },
                summary: 'No linked controls carry an effectiveness signal yet',
            },
        });
        const onLinkControls = jest.fn();
        await renderPanel({ onLinkControls });
        fireEvent.click(screen.getByText('Link controls in Traceability'));
        expect(onLinkControls).toHaveBeenCalled();
    });
});

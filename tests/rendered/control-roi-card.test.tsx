/**
 * RQ3-8 — ControlRoiCard rendered tests.
 *
 * Pins the honest-null UX: ok verdict renders the headline + ROI
 * multiple; a gap verdict renders the typed nudge — no synthetic
 * "0×" leaks through.
 */
import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import useSWR from 'swr';

jest.mock('swr');
const useSWRMock = useSWR as jest.MockedFunction<typeof useSWR>;

jest.mock('@/lib/tenant-context-provider', () => ({
    useTenantContext: () => ({ currencySymbol: '€', tenantSlug: 'acme' }),
}));

jest.mock('@/lib/hooks/use-tenant-swr', () => ({
    useTenantSWR: (path: string) => useSWRMock(path),
}));

import { ControlRoiCard } from '@/app/t/[tenantSlug]/(app)/controls/[controlId]/_components/ControlRoiCard';

function mockSwrData(data: unknown) {
    useSWRMock.mockReturnValue({
        data,
        error: undefined,
        isLoading: false,
        isValidating: false,
        mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);
}

describe('ControlRoiCard', () => {
    afterEach(() => jest.clearAllMocks());

    it('ok verdict renders the headline + ROI multiple + risk count', async () => {
        mockSwrData({
            controlId: 'c-1', code: 'AC-1', name: 'MFA',
            annualCost: 10_000,
            effectiveness: 50,
            verdict: {
                ok: true,
                value: {
                    aleProtected: 80_000,
                    roiMultiple: 8,
                    quantifiedRiskCount: 2,
                    linkedRiskCount: 3,
                },
            },
        });
        render(<ControlRoiCard controlId="c-1" />);
        await waitFor(() => expect(screen.getByTestId('control-roi-card')).toBeInTheDocument());
        expect(screen.getByTestId('control-roi-multiple').textContent).toBe('8.0×');
        expect(screen.getByTestId('control-roi-headline').textContent).toMatch(/€80K/);
        expect(screen.getByTestId('control-roi-headline').textContent).toMatch(/€10K/);
        expect(screen.queryByTestId('control-roi-gap')).toBeNull();
    });

    it('NO_COST verdict renders the typed gap nudge — no fabricated ROI', async () => {
        mockSwrData({
            controlId: 'c-1', code: 'AC-1', name: 'MFA',
            annualCost: null, effectiveness: 80,
            verdict: { ok: false, reason: 'NO_COST', linkedRiskCount: 2 },
        });
        render(<ControlRoiCard controlId="c-1" />);
        await waitFor(() => expect(screen.getByTestId('control-roi-card')).toBeInTheDocument());
        expect(screen.getByTestId('control-roi-gap').textContent).toMatch(/Set an annual cost/);
        expect(screen.queryByTestId('control-roi-multiple')).toBeNull();
    });

    it('NO_QUANT_RISKS with linkedRiskCount=0 nudges to link a risk first', async () => {
        mockSwrData({
            controlId: 'c-1', code: 'AC-1', name: 'MFA',
            annualCost: 10_000, effectiveness: 80,
            verdict: { ok: false, reason: 'NO_QUANT_RISKS', linkedRiskCount: 0 },
        });
        render(<ControlRoiCard controlId="c-1" />);
        expect(screen.getByTestId('control-roi-gap').textContent).toMatch(/Link this control to a risk first/);
    });

    it('NO_QUANT_RISKS with linked-but-unquantified nudges to quantify', async () => {
        mockSwrData({
            controlId: 'c-1', code: 'AC-1', name: 'MFA',
            annualCost: 10_000, effectiveness: 80,
            verdict: { ok: false, reason: 'NO_QUANT_RISKS', linkedRiskCount: 3 },
        });
        render(<ControlRoiCard controlId="c-1" />);
        expect(screen.getByTestId('control-roi-gap').textContent).toMatch(/Quantify the linked risks/);
    });
});

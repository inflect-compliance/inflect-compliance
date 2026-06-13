/**
 * RQ3-OB-F — <RiskFirstRunEmpty> rendered tests.
 *
 * The primitive's job is to produce the SAME empty-state shape on
 * every risk surface — same title, same description, same CTA target.
 * These tests pin that contract.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

jest.mock('@/lib/tenant-context-provider', () => ({
    useTenantHref: () => (p: string) => `/t/acme${p}`,
}));

import { RiskFirstRunEmpty } from '@/components/risks/RiskFirstRunEmpty';

describe('RiskFirstRunEmpty', () => {
    it('renders the unified title + description + testid', () => {
        render(<RiskFirstRunEmpty />);
        expect(screen.getByTestId('risk-first-run-empty')).toBeInTheDocument();
        expect(screen.getByText('No risks on the register yet')).toBeInTheDocument();
        expect(
            screen.getByText(/dashboard, board, and analytics views populate from here/),
        ).toBeInTheDocument();
    });

    it('default CTA is a navigation link to /risks?create=1 (tenant-scoped)', () => {
        render(<RiskFirstRunEmpty />);
        const cta = screen.getByTestId('risk-first-run-cta');
        expect(cta.tagName.toLowerCase()).toBe('a');
        expect(cta.getAttribute('href')).toBe('/t/acme/risks?create=1');
        expect(cta.textContent).toBe('Create your first risk');
    });

    it('onCreateClick swaps the CTA to a button (in-page modal use case)', () => {
        const onCreateClick = jest.fn();
        render(<RiskFirstRunEmpty onCreateClick={onCreateClick} />);
        const cta = screen.getByTestId('risk-first-run-cta');
        expect(cta.tagName.toLowerCase()).toBe('button');
        fireEvent.click(cta);
        expect(onCreateClick).toHaveBeenCalledTimes(1);
    });

    it('size="sm" still mounts the contract testid (compact form for in-card use)', () => {
        render(<RiskFirstRunEmpty size="sm" />);
        expect(screen.getByTestId('risk-first-run-empty')).toBeInTheDocument();
        expect(screen.getByTestId('risk-first-run-cta')).toBeInTheDocument();
    });

    it('respects a custom CTA label', () => {
        render(<RiskFirstRunEmpty ctaLabel="Get started" />);
        expect(screen.getByTestId('risk-first-run-cta').textContent).toBe(
            'Get started',
        );
    });
});

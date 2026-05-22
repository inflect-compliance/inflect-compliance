/** @jest-environment jsdom */

/**
 * Rendered (Tier-2) test — `<AiAssistRail>` (right-rail Phase 3).
 *
 * Pins the AI co-pilot rail content: the explainer + the three
 * how-it-works steps render, and the launch CTA points at exactly the
 * `aiHref` the page resolved (the primitive never builds tenant URLs
 * itself).
 */
import { render, screen, within } from '@testing-library/react';
import * as React from 'react';

import { AiAssistRail } from '@/components/ui/ai-assist-rail';

describe('<AiAssistRail>', () => {
    it('renders the explainer and the three how-it-works steps', () => {
        render(<AiAssistRail aiHref="/t/acme/risks/ai" />);
        const rail = screen.getByTestId('ai-assist-rail');
        expect(rail).toHaveTextContent(/asset inventory/i);
        // The 3 numbered steps are an ordered list.
        const steps = within(rail).getByRole('list');
        expect(within(steps).getAllByRole('listitem')).toHaveLength(3);
    });

    it('the launch CTA links to the supplied aiHref', () => {
        render(<AiAssistRail aiHref="/t/acme/risks/ai" />);
        const cta = screen.getByTestId('ai-assist-rail-cta');
        expect(cta).toHaveAttribute('href', '/t/acme/risks/ai');
        expect(cta).toHaveTextContent(/generate risk suggestions/i);
    });

    it('uses whatever href the page resolves — no hard-coded path', () => {
        // Proves the primitive is href-agnostic: a different tenant
        // slug flows straight through.
        render(<AiAssistRail aiHref="/t/other-tenant/risks/ai" />);
        expect(screen.getByTestId('ai-assist-rail-cta')).toHaveAttribute(
            'href',
            '/t/other-tenant/risks/ai',
        );
    });
});

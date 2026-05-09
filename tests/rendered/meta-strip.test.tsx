/**
 * Polish PR-5 — MetaStrip rendered tests.
 */

import { render, screen } from '@testing-library/react';
import * as React from 'react';

import { MetaStrip } from '@/components/ui/meta-strip';

describe('<MetaStrip />', () => {
    it('renders nothing when items is empty', () => {
        const { container } = render(<MetaStrip items={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders text items with eyebrow labels', () => {
        render(
            <MetaStrip
                items={[
                    { label: 'Owner', value: 'Jane Smith' },
                    { label: 'Framework', value: 'ISO 27001' },
                ]}
            />,
        );
        expect(screen.getByText('Owner').className).toContain('uppercase');
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('Framework').className).toContain('uppercase');
        expect(screen.getByText('ISO 27001')).toBeInTheDocument();
    });

    it('renders status items with a StatusBadge', () => {
        render(
            <MetaStrip
                items={[
                    {
                        kind: 'status',
                        label: 'Status',
                        value: 'Published',
                        variant: 'success',
                    },
                ]}
            />,
        );
        const badge = screen.getByText('Published');
        // StatusBadge wraps children in a span/badge with status classes.
        expect(badge.closest('[class*="rounded-full"]')).not.toBeNull();
    });

    it('renders metric items with KPIStat sm', () => {
        render(
            <MetaStrip
                items={[
                    {
                        kind: 'metric',
                        label: 'Score',
                        value: 12,
                        tone: 'attention',
                    },
                ]}
            />,
        );
        const valueEl = screen.getByText('12');
        expect(valueEl.className).toContain('text-xl'); // size sm
        expect(valueEl.className).toContain('text-content-warning');
    });

    it('wraps an item in an anchor when href is provided', () => {
        render(
            <MetaStrip
                items={[
                    {
                        label: 'Owner',
                        value: 'Jane',
                        href: '/users/jane',
                    },
                ]}
            />,
        );
        const link = screen.getByRole('link');
        expect(link.getAttribute('href')).toBe('/users/jane');
    });

    it('applies tone class to text values', () => {
        render(
            <MetaStrip
                items={[
                    { label: 'Next review', value: '5 days', tone: 'critical' },
                ]}
            />,
        );
        expect(screen.getByText('5 days').className).toContain(
            'text-content-error',
        );
    });

    it('mounts the canonical data-testid', () => {
        const { container } = render(
            <MetaStrip items={[{ label: 'A', value: 'b' }]} />,
        );
        expect(
            container.querySelector('[data-testid="meta-strip"]'),
        ).toBeInTheDocument();
    });
});

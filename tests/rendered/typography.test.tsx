/**
 * Typography primitives — render + shape tests.
 *
 * Locks the contract for `<Heading>`, `<Eyebrow>`, `<Caption>`,
 * `<TextLink>` so the design-system shape can't drift silently.
 */
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import {
  Heading,
  Eyebrow,
  Caption,
  TextLink,
} from '@/components/ui/typography';

describe('Heading', () => {
  it('renders a level-1 heading by default with the canonical h1 styling', () => {
    render(<Heading>Page title</Heading>);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass('text-2xl');
    expect(heading).toHaveClass('font-semibold');
    expect(heading).toHaveClass('text-content-emphasis');
  });

  it('matches level → tag for L1/L2/L3', () => {
    const { rerender } = render(<Heading level={1}>L1</Heading>);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    rerender(<Heading level={2}>L2</Heading>);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    rerender(<Heading level={3}>L3</Heading>);
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  it('honours the `as` override when supplied', () => {
    render(
      <Heading level={1} as="div" data-testid="div-heading">
        Title
      </Heading>,
    );
    const el = screen.getByTestId('div-heading');
    expect(el.tagName).toBe('DIV');
    // Visual style still corresponds to level 1
    expect(el).toHaveClass('text-2xl');
  });

  it('applies muted tone when requested', () => {
    render(<Heading tone="muted">Muted</Heading>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass(
      'text-content-muted',
    );
  });

  it('passes through arbitrary className additions', () => {
    render(<Heading className="mt-4">Title</Heading>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('mt-4');
  });
});

describe('Eyebrow', () => {
  it('renders the canonical small uppercase muted label', () => {
    render(<Eyebrow data-testid="eyebrow">Section</Eyebrow>);
    const el = screen.getByTestId('eyebrow');
    expect(el).toHaveClass('text-xs');
    expect(el).toHaveClass('uppercase');
    expect(el).toHaveClass('tracking-wider');
    expect(el).toHaveClass('text-content-muted');
    expect(el).toHaveClass('font-semibold');
  });
});

describe('Caption', () => {
  it('renders muted descriptive copy', () => {
    render(<Caption data-testid="caption">Helpful description</Caption>);
    const el = screen.getByTestId('caption');
    expect(el.tagName).toBe('P');
    expect(el).toHaveClass('text-sm');
    expect(el).toHaveClass('text-content-muted');
  });
});

describe('TextLink', () => {
  it('renders an anchor with the default tone', () => {
    render(
      <TextLink href="/x" data-testid="link">
        Open
      </TextLink>,
    );
    const el = screen.getByTestId('link');
    expect(el.tagName).toBe('A');
    expect(el).toHaveClass('text-content-emphasis');
    expect(el).toHaveClass('font-medium');
    expect(el).toHaveClass('transition-colors');
  });

  it('respects the muted tone variant', () => {
    render(
      <TextLink href="/x" tone="muted" data-testid="link-muted">
        Aside
      </TextLink>,
    );
    expect(screen.getByTestId('link-muted')).toHaveClass('text-content-muted');
  });

  it('respects the underline tone variant', () => {
    render(
      <TextLink href="/x" tone="underline" data-testid="link-underline">
        Learn more
      </TextLink>,
    );
    const el = screen.getByTestId('link-underline');
    expect(el).toHaveClass('underline');
    expect(el).toHaveClass('underline-offset-2');
  });

  it('forwards arbitrary anchor attributes', () => {
    render(
      <TextLink
        href="/x"
        target="_blank"
        rel="noopener"
        data-testid="link-attrs"
      >
        External
      </TextLink>,
    );
    const el = screen.getByTestId('link-attrs');
    expect(el).toHaveAttribute('target', '_blank');
    expect(el).toHaveAttribute('rel', 'noopener');
  });

  it('exposes a focus-visible ring via the shared semantic token', () => {
    render(
      <TextLink href="/x" data-testid="link-focus">
        Focus me
      </TextLink>,
    );
    expect(screen.getByTestId('link-focus')).toHaveClass(
      'focus-visible:ring-ring',
    );
  });
});

/**
 * ErrorState primitive — render tests (PR-8).
 *
 * Locks the contract for `<ErrorState>` so the canonical error
 * surface can't drift silently as adoption grows.
 */
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from '@/components/ui/error-state';

describe('ErrorState', () => {
  it('renders with the default title and AlertTriangle icon', () => {
    render(<ErrorState />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    // The decorative icon container sits above the title.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders a custom title and description', () => {
    render(
      <ErrorState
        title="Couldn't load risks"
        description="The server returned a 500 — try again in a moment."
      />,
    );
    expect(screen.getByText("Couldn't load risks")).toBeInTheDocument();
    expect(
      screen.getByText('The server returned a 500 — try again in a moment.'),
    ).toBeInTheDocument();
  });

  it('renders a retry button when onRetry is provided', async () => {
    const onRetry = jest.fn();
    render(<ErrorState onRetry={onRetry} />);
    const button = screen.getByRole('button', { name: 'Try again' });
    await userEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('respects a custom retry label', () => {
    render(<ErrorState onRetry={() => undefined} retryLabel="Reload" />);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('does NOT render a retry button when onRetry is undefined', () => {
    render(<ErrorState description="Read-only error" />);
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
  });

  it('renders a secondary action button alongside retry', async () => {
    const onSecondary = jest.fn();
    render(
      <ErrorState
        onRetry={() => undefined}
        secondaryAction={{
          label: 'Go back',
          onClick: onSecondary,
          'data-testid': 'go-back',
        }}
      />,
    );
    const goBack = screen.getByTestId('go-back');
    await userEvent.click(goBack);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('disables the retry button when retryDisabled is true', () => {
    render(<ErrorState onRetry={() => undefined} retryDisabled />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it('forwards data-testid to the outer wrapper and derives a retry test id', () => {
    render(
      <ErrorState data-testid="risks-error" onRetry={() => undefined} />,
    );
    expect(screen.getByTestId('risks-error')).toBeInTheDocument();
    expect(screen.getByTestId('risks-error-retry')).toBeInTheDocument();
  });

  it('uses an aria-live=polite alert region so screen readers announce the failure', () => {
    render(<ErrorState />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });
});

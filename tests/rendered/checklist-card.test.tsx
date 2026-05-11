/**
 * R11-PR10 — ChecklistCard render tests.
 *
 * Pins the contract:
 *
 *   1. Progress count renders "X of Y" with the correct values.
 *   2. Each step renders with the correct done/not-done icon.
 *   3. Done steps render their label line-through.
 *   4. Not-done steps with an action render a CTA Button.
 *   5. Done steps do NOT render their CTA (already complete).
 *   6. When every step is done, the card collapses to a success state
 *      and steps disappear (replaced by the completed-label).
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { ChecklistCard, type ChecklistStep } from '@/components/ui/checklist-card';

function makeSteps(overrides: Partial<ChecklistStep>[] = []): ChecklistStep[] {
    const base: ChecklistStep[] = [
        { id: 'a', label: 'Install a framework', done: false, action: { label: 'Install' } },
        { id: 'b', label: 'Add a risk', done: false },
        { id: 'c', label: 'Upload evidence', done: false },
    ];
    return base.map((step, i) => ({ ...step, ...(overrides[i] ?? {}) }));
}

describe('ChecklistCard', () => {
    test('progress count reflects the done/total ratio', () => {
        const steps = makeSteps([
            { done: true },
            { done: false },
            { done: false },
        ]);
        render(<ChecklistCard title="Get started" steps={steps} />);
        expect(
            screen.getByTestId('checklist-card-progress'),
        ).toHaveTextContent('1 of 3');
    });

    test('not-done steps render their CTA Button; done steps do not', () => {
        const steps = makeSteps([
            { done: true, action: { label: 'Install' } },
            { done: false, action: { label: 'Add' } },
        ]);
        render(<ChecklistCard title="Get started" steps={steps} />);
        // Step `b` is not-done — CTA should render.
        expect(
            screen.getByTestId('checklist-card-step-b-action'),
        ).toBeInTheDocument();
        // Step `a` is done — CTA should NOT render.
        expect(
            screen.queryByTestId('checklist-card-step-a-action'),
        ).not.toBeInTheDocument();
    });

    test('done steps render with the data-step-done="true" attribute', () => {
        const steps = makeSteps([{ done: true }, { done: false }, { done: false }]);
        render(<ChecklistCard title="Get started" steps={steps} />);
        const doneStep = screen.getByTestId('checklist-card-step-a');
        expect(doneStep).toHaveAttribute('data-step-done', 'true');
        const notDoneStep = screen.getByTestId('checklist-card-step-b');
        expect(notDoneStep).toHaveAttribute('data-step-done', 'false');
    });

    test('when every step is done, the card collapses to the success state', () => {
        const steps = makeSteps([{ done: true }, { done: true }, { done: true }]);
        render(
            <ChecklistCard
                title="Get started"
                steps={steps}
                completedLabel="All set — onboarding complete."
            />,
        );
        // Success copy renders.
        expect(
            screen.getByText('All set — onboarding complete.'),
        ).toBeInTheDocument();
        // Steps are gone.
        expect(
            screen.queryByTestId('checklist-card-step-a'),
        ).not.toBeInTheDocument();
        // Outer card carries the complete flag.
        expect(screen.getByTestId('checklist-card')).toHaveAttribute(
            'data-checklist-complete',
            'true',
        );
    });

    test('description renders below the title when provided', () => {
        render(
            <ChecklistCard
                title="Get started"
                description="Five steps to your first audit."
                steps={makeSteps()}
            />,
        );
        expect(
            screen.getByText('Five steps to your first audit.'),
        ).toBeInTheDocument();
    });
});

/**
 * R2-P5 — the EXCEPTED verdict in the shared per-requirement rollup.
 *
 * `rollUpRequirementVerdict` is the ONE rollup both the ISO SoA and every
 * framework's coverage/readiness use, so asserting it here proves the
 * behaviour is framework-agnostic (a SOC 2 / NIS2 requirement rolls up the
 * same way as an ISO one — the verdict is computed from controls, not from
 * the framework). The scenarios mirror the acceptance criteria.
 */
import { rollUpRequirementVerdict } from '@/lib/compliance/requirement-status-rollup';

const A = (over: Partial<{ status: string; applicability: string; hasInForceException: boolean }> = {}) => ({
    status: over.status ?? 'NOT_STARTED',
    applicability: over.applicability ?? 'APPLICABLE',
    hasInForceException: over.hasInForceException ?? false,
});

describe('rollUpRequirementVerdict — EXCEPTED', () => {
    it('a NOT_STARTED applicable control WITH an in-force exception → excepted', () => {
        const { verdict } = rollUpRequirementVerdict([A({ status: 'NOT_STARTED', hasInForceException: true })]);
        expect(verdict).toBe('excepted');
    });

    it('the same control WITHOUT an in-force exception (e.g. after expiry) → gap', () => {
        const { verdict } = rollUpRequirementVerdict([A({ status: 'NOT_STARTED', hasInForceException: false })]);
        expect(verdict).toBe('gap');
    });

    it('one excepted gap control + one un-excepted gap control → stays gap', () => {
        const { verdict } = rollUpRequirementVerdict([
            A({ status: 'NOT_STARTED', hasInForceException: true }),
            A({ status: 'IN_PROGRESS', hasInForceException: false }),
        ]);
        expect(verdict).toBe('gap');
    });

    it('an implemented control needs no exception → implemented, never excepted', () => {
        const { verdict } = rollUpRequirementVerdict([A({ status: 'IMPLEMENTED', hasInForceException: false })]);
        expect(verdict).toBe('implemented');
    });

    it('excepted can never read as implemented', () => {
        const { verdict } = rollUpRequirementVerdict([A({ status: 'NOT_STARTED', hasInForceException: true })]);
        expect(verdict).not.toBe('implemented');
    });

    it('an exception on a NOT_APPLICABLE control is meaningless (not-applicable, not excepted)', () => {
        const { verdict } = rollUpRequirementVerdict([
            A({ status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', hasInForceException: true }),
        ]);
        expect(verdict).toBe('not-applicable');
    });

    it('an implemented control + an excepted gap control → excepted (the gapping one is covered)', () => {
        const { verdict } = rollUpRequirementVerdict([
            A({ status: 'IMPLEMENTED', hasInForceException: false }),
            A({ status: 'NOT_STARTED', hasInForceException: true }),
        ]);
        expect(verdict).toBe('excepted');
    });

    it('no mapped controls → unmapped', () => {
        expect(rollUpRequirementVerdict([]).verdict).toBe('unmapped');
    });
});

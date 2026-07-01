/**
 * Unit coverage for the NIS2 gap-lifecycle remediation ROUTER — the pure
 * `classify` that maps a prioritised gap to exactly one propose-not-commit
 * suggestion. The management-liability lens (fine / personal liability → RISK)
 * is load-bearing, so it's asserted directly here.
 */
import { classify, NIS2_GAP_CATEGORY, type RemediationKind } from '@/app-layer/usecases/nis2-gap-lifecycle';
import type { Nis2Gap } from '@/app-layer/usecases/nis2-readiness';

function gap(over: Partial<Nis2Gap>): Nis2Gap {
    return {
        questionId: 'gap-0-01',
        domainId: 0,
        criticality: 'HIGH',
        consequence: 'AUDIT_FINDING',
        fineExposure: false,
        timeToFix: 'WEEKS',
        legalBasis: '§28 BSIG',
        answer: 'NO',
        priority: 40,
        priorityTier: 'HIGH',
        plainText: { en: 'x', de: 'x' },
        ...over,
    };
}

describe('classify — propose-not-commit routing', () => {
    it('routes fine-exposure gaps to a RISK (board must own)', () => {
        expect(classify(gap({ fineExposure: true }), false)).toBe<RemediationKind>('RISK');
    });

    it('routes PERSONAL_LIABILITY gaps to a RISK', () => {
        expect(classify(gap({ consequence: 'PERSONAL_LIABILITY' }), true)).toBe<RemediationKind>('RISK');
    });

    it('routes quick-win gaps to a TASK', () => {
        expect(classify(gap({ timeToFix: 'QUICK_WIN' }), true)).toBe<RemediationKind>('TASK');
    });

    it('prefers linking an existing NIS2 control over duplicating one', () => {
        expect(classify(gap({}), true)).toBe<RemediationKind>('CONTROL_LINK');
    });

    it('proposes creating a control only when no NIS2 control exists', () => {
        expect(classify(gap({}), false)).toBe<RemediationKind>('CONTROL_CREATE');
    });

    it('exposes the dedupe category sentinel', () => {
        expect(NIS2_GAP_CATEGORY).toBe('NIS2_GAP');
    });
});

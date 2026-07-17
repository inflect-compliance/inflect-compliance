/**
 * The shared "policy that counts" predicate — behavioural gating.
 * A DRAFT / IN_REVIEW / APPROVED / ARCHIVED / soft-deleted policy must NOT
 * count; only a live PUBLISHED policy does.
 */
import {
    policyCountsTowardCoverage,
    policyCountsWhere,
    POLICY_COUNTS_STATUS,
    hasOutstandingAcknowledgement,
} from '@/lib/policy/coverage-predicate';

describe('policyCountsTowardCoverage', () => {
    it('counts a PUBLISHED, non-deleted policy', () => {
        expect(policyCountsTowardCoverage({ status: 'PUBLISHED', deletedAt: null })).toBe(true);
        expect(policyCountsTowardCoverage({ status: 'PUBLISHED' })).toBe(true);
    });

    it.each(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'])('does NOT count a %s policy', (status) => {
        expect(policyCountsTowardCoverage({ status, deletedAt: null })).toBe(false);
    });

    it('does NOT count a soft-deleted PUBLISHED policy', () => {
        expect(policyCountsTowardCoverage({ status: 'PUBLISHED', deletedAt: new Date() })).toBe(false);
    });
});

describe('policyCountsWhere', () => {
    it('is a PUBLISHED + not-deleted, tenant-scoped filter', () => {
        expect(policyCountsWhere('t1')).toEqual({ tenantId: 't1', status: 'PUBLISHED', deletedAt: null });
        expect(POLICY_COUNTS_STATUS).toBe('PUBLISHED');
    });
});

describe('hasOutstandingAcknowledgement', () => {
    it('is outstanding when fewer assignees have acknowledged than were assigned', () => {
        expect(hasOutstandingAcknowledgement({ assignedCount: 10, acknowledgedCount: 3 })).toBe(true);
    });
    it('is NOT outstanding when everyone assigned has acknowledged', () => {
        expect(hasOutstandingAcknowledgement({ assignedCount: 10, acknowledgedCount: 10 })).toBe(false);
    });
    it('is NOT outstanding when there is no requirement (zero assigned)', () => {
        expect(hasOutstandingAcknowledgement({ assignedCount: 0, acknowledgedCount: 0 })).toBe(false);
    });
});

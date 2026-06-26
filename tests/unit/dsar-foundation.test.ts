/**
 * Unit tests for the DSAR foundation's pure decision logic — the
 * rejection evaluator and the erasure cooling-off guard. No DB.
 */
import {
    evaluateDsarRejection,
    DSAR_REJECTION_REASONS,
    DSAR_COOLING_OFF_HOURS,
} from '@/lib/dsar';
import { coolingOffElapsed } from '@/app-layer/jobs/dsar-erasure';

describe('evaluateDsarRejection', () => {
    const clean = { soleOwnerTenantCount: 0, hasOutstandingBalance: false, hasLegalHold: false };

    it('allows erasure when no criterion applies', () => {
        expect(evaluateDsarRejection(clean)).toBeNull();
    });

    it('rejects LAST_OWNER first (most actionable)', () => {
        expect(evaluateDsarRejection({ ...clean, soleOwnerTenantCount: 1 })).toBe(
            DSAR_REJECTION_REASONS.LAST_OWNER,
        );
        // LAST_OWNER takes precedence even when others also apply.
        expect(
            evaluateDsarRejection({ soleOwnerTenantCount: 2, hasOutstandingBalance: true, hasLegalHold: true }),
        ).toBe(DSAR_REJECTION_REASONS.LAST_OWNER);
    });

    it('rejects OUTSTANDING_BALANCE when not a sole owner', () => {
        expect(evaluateDsarRejection({ ...clean, hasOutstandingBalance: true })).toBe(
            DSAR_REJECTION_REASONS.OUTSTANDING_BALANCE,
        );
    });

    it('rejects LEGAL_HOLD last', () => {
        expect(evaluateDsarRejection({ ...clean, hasLegalHold: true })).toBe(
            DSAR_REJECTION_REASONS.LEGAL_HOLD,
        );
    });
});

describe('coolingOffElapsed (erasure 24h guard)', () => {
    const verifiedAt = new Date('2026-06-26T00:00:00Z');

    it('blocks erasure before the 24h window', () => {
        const within = new Date(verifiedAt.getTime() + (DSAR_COOLING_OFF_HOURS - 1) * 3_600_000);
        expect(coolingOffElapsed(verifiedAt, within)).toBe(false);
    });

    it('permits erasure once 24h has elapsed', () => {
        const after = new Date(verifiedAt.getTime() + DSAR_COOLING_OFF_HOURS * 3_600_000);
        expect(coolingOffElapsed(verifiedAt, after)).toBe(true);
    });
});

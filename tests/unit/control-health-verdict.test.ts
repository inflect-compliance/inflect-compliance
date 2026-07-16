/**
 * Unit tests for the composite control-health verdict
 * (src/lib/controls/control-health.ts) — the single gate over the measured
 * signals, most-severe-wins.
 */
import {
    computeControlHealthVerdict,
    CONTROL_HEALTH_VERDICT_VARIANT,
} from '@/lib/controls/control-health';

const base = {
    applicability: 'APPLICABLE',
    status: 'IMPLEMENTED',
    passRate: 100 as number | null,
    total: 10,
    overdue: false,
};

describe('computeControlHealthVerdict', () => {
    it('NOT_APPLICABLE short-circuits regardless of other signals', () => {
        expect(computeControlHealthVerdict({ ...base, applicability: 'NOT_APPLICABLE', passRate: 0, total: 5 }))
            .toBe('NOT_APPLICABLE');
    });

    it('UNKNOWN when there is no operating signal at all', () => {
        expect(computeControlHealthVerdict({ applicability: 'APPLICABLE', status: 'NEEDS_REVIEW', passRate: null, total: 0, overdue: false }))
            .toBe('UNKNOWN');
    });

    it('AT_RISK when the pass rate is failing (<70) or the control is not started', () => {
        expect(computeControlHealthVerdict({ ...base, passRate: 55 })).toBe('AT_RISK');
        expect(computeControlHealthVerdict({ ...base, status: 'NOT_STARTED', passRate: 100 })).toBe('AT_RISK');
    });

    it('DEGRADED on overdue, an accepted exception, a middling pass rate, or stale evidence', () => {
        expect(computeControlHealthVerdict({ ...base, overdue: true })).toBe('DEGRADED');
        expect(computeControlHealthVerdict({ ...base, openExceptions: 1 })).toBe('DEGRADED');
        expect(computeControlHealthVerdict({ ...base, passRate: 80 })).toBe('DEGRADED');
        expect(computeControlHealthVerdict({ ...base, evidenceFresh: false })).toBe('DEGRADED');
    });

    it('HEALTHY only when passing strongly, on-schedule, no exceptions, fresh evidence', () => {
        expect(computeControlHealthVerdict({ ...base, passRate: 95, openExceptions: 0, evidenceFresh: true })).toBe('HEALTHY');
    });

    it('missing detail-only signals (exceptions/evidence) default to non-degrading (list verdict)', () => {
        // The list passes only cheap signals; a strong pass rate + on-schedule
        // still reads HEALTHY without exceptions/evidence data.
        expect(computeControlHealthVerdict({ ...base, passRate: 100 })).toBe('HEALTHY');
    });

    it('every verdict maps to a badge variant', () => {
        for (const v of ['HEALTHY', 'DEGRADED', 'AT_RISK', 'NOT_APPLICABLE', 'UNKNOWN'] as const) {
            expect(CONTROL_HEALTH_VERDICT_VARIANT[v]).toBeTruthy();
        }
    });
});

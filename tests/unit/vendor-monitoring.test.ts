/**
 * Vendor-monitoring pure evaluators (unit) — no DB, no network.
 * The attestation-expiry, header-grading, breach-freshness, and grade-
 * threshold logic the usecase + providers stand on.
 */
import {
    evaluateAttestations,
    gradeSecurityHeaders,
    isFailingGrade,
    isNewBreach,
    GRADED_SECURITY_HEADERS,
    type AttestationView,
} from '@/app-layer/services/vendor-monitoring/evaluate';
import { TestModeBreachProvider } from '@/app-layer/services/vendor-monitoring/breach-provider';
import { TestModeTlsProvider } from '@/app-layer/services/vendor-monitoring/tls-provider';
import type { BreachSignal } from '@/app-layer/services/vendor-monitoring/types';

const now = new Date('2026-07-01T00:00:00.000Z');

describe('evaluateAttestations', () => {
    const mk = (id: string, end: string | null): AttestationView => ({ extractionId: id, reportType: 'SOC2_TYPE2', auditPeriodEnd: end ? new Date(end) : null });

    it('returns OK when there are no dated reports', () => {
        expect(evaluateAttestations([mk('a', null)], now).status).toBe('OK');
        expect(evaluateAttestations([], now).status).toBe('OK');
    });

    it('EXPIRED when the earliest report period is in the past', () => {
        const v = evaluateAttestations([mk('a', '2026-05-01'), mk('b', '2027-01-01')], now);
        expect(v.status).toBe('EXPIRED');
        expect(v.governing?.extractionId).toBe('a'); // earliest-expiring governs
    });

    it('EXPIRING when the earliest report lands inside the 30-day lead window', () => {
        const v = evaluateAttestations([mk('a', '2026-07-20')], now);
        expect(v.status).toBe('EXPIRING');
    });

    it('OK when the earliest report is comfortably in the future', () => {
        expect(evaluateAttestations([mk('a', '2026-12-01')], now).status).toBe('OK');
    });
});

describe('gradeSecurityHeaders', () => {
    it('grades A when all expected headers are present (case-insensitive)', () => {
        const headers: Record<string, string> = {};
        for (const h of GRADED_SECURITY_HEADERS) headers[h.toUpperCase()] = 'x';
        expect(gradeSecurityHeaders(headers).grade).toBe('A');
    });

    it('grades F when no security headers are present', () => {
        const g = gradeSecurityHeaders({ 'content-type': 'text/html' });
        expect(g.grade).toBe('F');
        expect(g.missingHeaders.length).toBe(GRADED_SECURITY_HEADERS.length);
    });

    it('partial coverage lands a middle grade', () => {
        const g = gradeSecurityHeaders({ 'strict-transport-security': 'x', 'content-security-policy': 'x', 'x-frame-options': 'x' });
        expect(['B', 'C']).toContain(g.grade);
        expect(g.presentHeaders).toContain('strict-transport-security');
    });
});

describe('isFailingGrade', () => {
    it('D/E/F are failing; A/B/C and null are not', () => {
        expect(['D', 'E', 'F'].every(isFailingGrade)).toBe(true);
        expect(['A', 'B', 'C'].some(isFailingGrade)).toBe(false);
        expect(isFailingGrade(null)).toBe(false);
    });
});

describe('isNewBreach', () => {
    const sig = (breached: boolean, at?: string): BreachSignal => ({ source: 'stub', breached, latestBreachAt: at, breaches: breached ? [{ name: 'x', date: at }] : [] });

    it('false when not breached', () => {
        expect(isNewBreach(sig(false), null)).toBe(false);
    });
    it('true on first-ever breach (no prior seen date)', () => {
        expect(isNewBreach(sig(true, '2024-01-01'), null)).toBe(true);
    });
    it('true only when strictly newer than the last-seen breach', () => {
        expect(isNewBreach(sig(true, '2024-06-01'), new Date('2024-01-01'))).toBe(true);
        expect(isNewBreach(sig(true, '2024-01-01'), new Date('2024-06-01'))).toBe(false);
        expect(isNewBreach(sig(true, '2024-01-01'), new Date('2024-01-01'))).toBe(false);
    });
});

describe('provider stubs are deterministic + network-free', () => {
    it('breach stub returns the same verdict for the same domain', async () => {
        const p = new TestModeBreachProvider();
        const a = await p.check('example.com');
        const b = await p.check('example.com');
        expect(a).toEqual(b);
    });
    it('breach stub flags a domain containing "breached"', async () => {
        const p = new TestModeBreachProvider();
        const r = await p.check('breached-vendor.com');
        expect(r.breached).toBe(true);
        expect(r.latestBreachAt).toBeTruthy();
    });
    it('tls stub returns a stable grade for the same domain', async () => {
        const p = new TestModeTlsProvider();
        const a = await p.grade('example.com');
        const b = await p.grade('example.com');
        expect(a.grade).toBe(b.grade);
        expect(a.grade).toMatch(/^[A-F]$/);
    });
});

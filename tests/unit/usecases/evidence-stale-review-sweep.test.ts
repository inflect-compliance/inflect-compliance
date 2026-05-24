/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks. */
/**
 * Unit tests for the evidence stale-review sweep (Audit S3,
 * 2026-05-22). The sweep transitions APPROVED evidence past its
 * `nextReviewDate` to NEEDS_REVIEW in a bounded batch update.
 */
const updateManyMock = jest.fn();
jest.mock('@/lib/prisma', () => ({
    prisma: { evidence: { updateMany: updateManyMock } },
}));
jest.mock('@/lib/observability/job-runner', () => ({
    runJob: jest.fn(async (_name: string, fn: any) => fn()),
}));
jest.mock('@/lib/observability/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { runEvidenceStaleReviewSweep } from '@/app-layer/usecases/evidence-stale-review-sweep';

beforeEach(() => {
    updateManyMock.mockReset();
});

describe('runEvidenceStaleReviewSweep', () => {
    it('returns the count of transitioned rows', async () => {
        updateManyMock.mockResolvedValueOnce({ count: 4 });
        const out = await runEvidenceStaleReviewSweep();
        expect(out).toEqual({ transitioned: 4 });
    });

    it('queries APPROVED + past-due + non-deleted + non-archived', async () => {
        updateManyMock.mockResolvedValueOnce({ count: 0 });
        const now = new Date('2026-05-24T00:00:00Z');
        await runEvidenceStaleReviewSweep({ now });
        const call = updateManyMock.mock.calls[0][0];
        expect(call.where.status).toBe('APPROVED');
        expect(call.where.deletedAt).toBeNull();
        expect(call.where.isArchived).toBe(false);
        // `nextReviewDate < now` (not <=) — the cron runs daily, so a
        // row whose review date is exactly today shouldn't flip until
        // the day actually rolls over.
        expect(call.where.nextReviewDate.lt).toBe(now);
        expect(call.where.nextReviewDate.not).toBeNull();
    });

    it('writes status: NEEDS_REVIEW (and only status)', async () => {
        updateManyMock.mockResolvedValueOnce({ count: 1 });
        await runEvidenceStaleReviewSweep();
        const call = updateManyMock.mock.calls[0][0];
        expect(call.data).toEqual({ status: 'NEEDS_REVIEW' });
    });

    it('scopes to a single tenant when tenantId is provided', async () => {
        updateManyMock.mockResolvedValueOnce({ count: 2 });
        await runEvidenceStaleReviewSweep({ tenantId: 't-42' });
        const call = updateManyMock.mock.calls[0][0];
        expect(call.where.tenantId).toBe('t-42');
    });

    it('sweeps all tenants when no tenantId — where clause omits tenantId', async () => {
        updateManyMock.mockResolvedValueOnce({ count: 9 });
        await runEvidenceStaleReviewSweep();
        const call = updateManyMock.mock.calls[0][0];
        expect(call.where.tenantId).toBeUndefined();
    });

    it('zero transitions on an empty sweep', async () => {
        updateManyMock.mockResolvedValueOnce({ count: 0 });
        const out = await runEvidenceStaleReviewSweep();
        expect(out.transitioned).toBe(0);
    });

    it('uses the injected `now` for the cutoff (deterministic in tests)', async () => {
        updateManyMock.mockResolvedValueOnce({ count: 0 });
        const fixed = new Date('2024-01-01T12:00:00Z');
        await runEvidenceStaleReviewSweep({ now: fixed });
        const call = updateManyMock.mock.calls[0][0];
        expect(call.where.nextReviewDate.lt).toBe(fixed);
    });
});

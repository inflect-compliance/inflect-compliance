/**
 * PR-7 — CONNECTED_APP access reviews: snapshot connected accounts, submit
 * decisions, and close (REVOKE → remediation task). The mature member flow is
 * untouched; this exercises the parallel connected module.
 */
jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: unknown, fn: (db: unknown) => unknown) => fn(mockDb)),
}));
jest.mock('@/lib/observability/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/app-layer/events/audit', () => ({ logEvent: jest.fn() }));
jest.mock('@/app-layer/repositories/AccessReviewRepository', () => ({
    AccessReviewRepository: {
        create: jest.fn(async () => ({ id: 'ar-1', name: 'Q3 connected' })),
        closeCampaign: jest.fn(async () => 1),
    },
}));

import { createConnectedAccessReview, submitConnectedDecision, closeConnectedAccessReview } from '@/app-layer/usecases/access-review-connected';
import { makeRequestContext } from '../helpers/make-context';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const mockDb = {
    connectedIdentityAccount: { findMany: jest.fn() },
    accessReviewConnectedDecision: { createMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    accessReview: { findFirst: jest.fn() },
    task: { create: jest.fn() },
};

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.connectedIdentityAccount.findMany.mockResolvedValue([
        { id: 'acc-1', provider: 'okta', email: 'a@x.com', displayName: 'A', isAdmin: true, mfaEnrolled: false, groupsJson: [] },
        { id: 'acc-2', provider: 'okta', email: 'b@x.com', displayName: 'B', isAdmin: false, mfaEnrolled: true, groupsJson: [] },
    ]);
    mockDb.accessReviewConnectedDecision.createMany.mockResolvedValue({ count: 2 });
    mockDb.accessReview.findFirst.mockResolvedValue({ id: 'ar-1', name: 'Q3 connected', status: 'OPEN', deletedAt: null });
    mockDb.task.create.mockResolvedValue({ id: 'task-1' });
    mockDb.accessReviewConnectedDecision.updateMany.mockResolvedValue({ count: 1 });
});

describe('createConnectedAccessReview', () => {
    it('snapshots active connected accounts into decision rows', async () => {
        const ctx = makeRequestContext('ADMIN');
        const r = await createConnectedAccessReview(ctx, { name: 'Q3 connected', reviewerUserId: 'u-rev' });
        expect(r.snapshotCount).toBe(2);
        const rows = mockDb.accessReviewConnectedDecision.createMany.mock.calls[0][0].data;
        expect(rows[0].subjectRef).toBe('okta:a@x.com');
        expect(rows[0].snapshotJson).toMatchObject({ provider: 'okta', isAdmin: true });
    });

    it('rejects when there are no active connected accounts', async () => {
        mockDb.connectedIdentityAccount.findMany.mockResolvedValue([]);
        const ctx = makeRequestContext('ADMIN');
        await expect(createConnectedAccessReview(ctx, { name: 'x', reviewerUserId: 'u' })).rejects.toThrow(/zero subjects|No active/i);
    });

    it('forbids a non-admin', async () => {
        const ctx = makeRequestContext('READER');
        await expect(createConnectedAccessReview(ctx, { name: 'x', reviewerUserId: 'u' })).rejects.toThrow();
    });
});

describe('submitConnectedDecision', () => {
    it('records a verdict on a pending decision', async () => {
        mockDb.accessReviewConnectedDecision.updateMany.mockResolvedValueOnce({ count: 1 });
        const ctx = makeRequestContext('ADMIN');
        const r = await submitConnectedDecision(ctx, 'dec-1', { decision: 'REVOKE', notes: 'left company' }, NOW);
        expect(r.decision).toBe('REVOKE');
        const where = mockDb.accessReviewConnectedDecision.updateMany.mock.calls[0][0].where;
        expect(where).toMatchObject({ id: 'dec-1', decision: null });
    });

    it('rejects a re-decision (already decided)', async () => {
        mockDb.accessReviewConnectedDecision.updateMany.mockResolvedValueOnce({ count: 0 });
        const ctx = makeRequestContext('ADMIN');
        await expect(submitConnectedDecision(ctx, 'dec-1', { decision: 'CONFIRM' }, NOW)).rejects.toThrow(/already decided|not found/i);
    });
});

describe('closeConnectedAccessReview', () => {
    it('emits a remediation task per REVOKE/MODIFY and closes', async () => {
        mockDb.accessReviewConnectedDecision.findMany.mockResolvedValue([
            { id: 'd1', subjectRef: 'okta:a@x.com', decision: 'REVOKE' },
            { id: 'd2', subjectRef: 'okta:b@x.com', decision: 'CONFIRM' },
            { id: 'd3', subjectRef: 'okta:c@x.com', decision: 'MODIFY' },
        ]);
        const ctx = makeRequestContext('ADMIN');
        const r = await closeConnectedAccessReview(ctx, 'ar-1', NOW);
        expect(r.executed).toBe(3);
        expect(r.remediationTasks).toBe(2); // REVOKE + MODIFY, not CONFIRM
        expect(mockDb.task.create).toHaveBeenCalledTimes(2);
    });

    it('refuses to close with pending decisions', async () => {
        mockDb.accessReviewConnectedDecision.findMany.mockResolvedValue([{ id: 'd1', subjectRef: 'x', decision: null }]);
        const ctx = makeRequestContext('ADMIN');
        await expect(closeConnectedAccessReview(ctx, 'ar-1', NOW)).rejects.toThrow(/pending/i);
        expect(mockDb.task.create).not.toHaveBeenCalled();
    });
});

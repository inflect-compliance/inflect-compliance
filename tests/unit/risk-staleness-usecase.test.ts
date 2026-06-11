/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * RQ2-8 — getRiskStaleness loader suite: batched signal queries (no
 * per-risk loops), correct map joins, rot-first ordering.
 */

const mockDb = {
    risk: { findMany: jest.fn() },
    riskScoreEvent: { groupBy: jest.fn() },
    riskControl: { findMany: jest.fn() },
    controlTestRun: { groupBy: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

import { getRiskStaleness } from '@/app-layer/usecases/risk-staleness';
import { makeRequestContext } from '../helpers/make-context';

const readerCtx = makeRequestContext('READER');
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.risk.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.riskScoreEvent.groupBy as jest.Mock).mockResolvedValue([]);
    (mockDb.riskControl.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.controlTestRun.groupBy as jest.Mock).mockResolvedValue([]);
});

describe('getRiskStaleness', () => {
    it('an empty register short-circuits with zero queries beyond the scan', async () => {
        const report = await getRiskStaleness(readerCtx);
        expect(report).toMatchObject({ staleRisks: [], staleCount: 0, totalCount: 0 });
        expect(mockDb.riskScoreEvent.groupBy).not.toHaveBeenCalled();
    });

    it('joins the three signal sources per risk and flags only the rotten rows', async () => {
        (mockDb.risk.findMany as jest.Mock).mockResolvedValue([
            { id: 'fresh', title: 'Fresh', nextReviewAt: daysAgo(-30), residualScoreSetAt: daysAgo(2) },
            { id: 'overdue', title: 'Overdue', nextReviewAt: daysAgo(10), residualScoreSetAt: null },
            { id: 'moved', title: 'Moved', nextReviewAt: null, residualScoreSetAt: daysAgo(90) },
        ]);
        (mockDb.riskScoreEvent.groupBy as jest.Mock).mockResolvedValue([
            { riskId: 'fresh', _max: { createdAt: daysAgo(2) } },
            { riskId: 'overdue', _max: { createdAt: daysAgo(20) } },
            { riskId: 'moved', _max: { createdAt: daysAgo(90) } },
        ]);
        (mockDb.riskControl.findMany as jest.Mock).mockResolvedValue([
            { riskId: 'moved', controlId: 'c-1' },
        ]);
        (mockDb.controlTestRun.groupBy as jest.Mock).mockResolvedValue([
            { controlId: 'c-1', _max: { executedAt: daysAgo(3) } },
        ]);

        const report = await getRiskStaleness(readerCtx);

        expect(report.totalCount).toBe(3);
        expect(report.staleCount).toBe(2);
        const ids = report.staleRisks.map((r) => r.riskId);
        expect(ids).toContain('overdue');
        expect(ids).toContain('moved');
        expect(ids).not.toContain('fresh');
        const moved = report.staleRisks.find((r) => r.riskId === 'moved')!;
        expect(moved.reasons).toEqual(['CONTROLS_MOVED_SINCE']);
        expect(moved.description).toMatch(/control test results changed/);
    });

    it('only COMPLETED test runs participate in the evidence signal', async () => {
        (mockDb.risk.findMany as jest.Mock).mockResolvedValue([
            { id: 'r1', title: 'R', nextReviewAt: null, residualScoreSetAt: daysAgo(90) },
        ]);
        (mockDb.riskControl.findMany as jest.Mock).mockResolvedValue([
            { riskId: 'r1', controlId: 'c-1' },
        ]);
        await getRiskStaleness(readerCtx);
        const q = (mockDb.controlTestRun.groupBy as jest.Mock).mock.calls[0][0];
        expect(q.where.status).toBe('COMPLETED');
    });

    it('orders rot-first: more reasons, then older assessments', async () => {
        (mockDb.risk.findMany as jest.Mock).mockResolvedValue([
            { id: 'a', title: 'A', nextReviewAt: daysAgo(1), residualScoreSetAt: null },
            { id: 'b', title: 'B', nextReviewAt: daysAgo(1), residualScoreSetAt: null },
        ]);
        (mockDb.riskScoreEvent.groupBy as jest.Mock).mockResolvedValue([
            { riskId: 'a', _max: { createdAt: daysAgo(200) } },
            { riskId: 'b', _max: { createdAt: daysAgo(400) } },
        ]);
        const report = await getRiskStaleness(readerCtx);
        expect(report.staleRisks.map((r) => r.riskId)).toEqual(['b', 'a']);
    });
});

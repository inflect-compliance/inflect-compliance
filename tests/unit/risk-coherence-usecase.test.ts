/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * RQ2-5 — getRiskCoherence usecase suite: the thin loader resolves
 * ALE per row (FAIR over legacy), excludes soft-deleted rows, and
 * hands the pure detector the qual score.
 */

const mockDb = {
    risk: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

import { getRiskCoherence } from '@/app-layer/usecases/risk-analytics';
import { makeRequestContext } from '../helpers/make-context';

const readerCtx = makeRequestContext('READER');

const row = (
    id: string,
    inherentScore: number,
    over: Partial<{ sleAmount: number | null; aroAmount: number | null; fairAle: number | null }> = {},
) => ({
    id,
    title: `Risk ${id}`,
    inherentScore,
    sleAmount: null,
    aroAmount: null,
    fairAle: null,
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.risk.findMany as jest.Mock).mockResolvedValue([]);
});

describe('getRiskCoherence', () => {
    it('queries only live tenant rows with the narrow quant select', async () => {
        await getRiskCoherence(readerCtx);
        const q = (mockDb.risk.findMany as jest.Mock).mock.calls[0][0];
        expect(q.where).toMatchObject({ tenantId: readerCtx.tenantId, deletedAt: null });
        expect(Object.keys(q.select).sort()).toEqual(
            ['aroAmount', 'fairAle', 'id', 'inherentScore', 'sleAmount', 'title'].sort(),
        );
    });

    it('resolves FAIR ALE over legacy SLE×ARO and flags the planted contradiction', async () => {
        (mockDb.risk.findMany as jest.Mock).mockResolvedValue([
            row('r1', 20, { sleAmount: 100_000, aroAmount: 2 }),
            row('r2', 16, { sleAmount: 80_000, aroAmount: 2 }),
            row('r3', 12, { sleAmount: 50_000, aroAmount: 2 }),
            row('r4', 9, { sleAmount: 30_000, aroAmount: 2 }),
            // FAIR'd whale: legacy fields say €10, fairAle says €5M.
            // Score 2 → bottom of the qual ranking.
            row('whale', 2, { sleAmount: 10, aroAmount: 1, fairAle: 5_000_000 }),
        ]);

        const report = await getRiskCoherence(readerCtx);

        expect(report.quantifiedCount).toBe(5);
        const flag = report.flags.find((f) => f.riskId === 'whale');
        expect(flag).toBeDefined();
        expect(flag!.direction).toBe('QUANT_HIGH_QUAL_LOW');
        expect(flag!.ale).toBe(5_000_000); // FAIR won over SLE×ARO
    });

    it('an unquantified portfolio returns the silent report', async () => {
        (mockDb.risk.findMany as jest.Mock).mockResolvedValue([
            row('r1', 20),
            row('r2', 5),
        ]);
        const report = await getRiskCoherence(readerCtx);
        expect(report).toMatchObject({ flags: [], quantifiedCount: 0, totalCount: 2 });
    });
});

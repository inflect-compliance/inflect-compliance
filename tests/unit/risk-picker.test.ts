/**
 * P2 — listRiskOptions (the shared analytics picker source).
 */
const mockDb = {
    risk: { findMany: jest.fn() },
} as unknown as { risk: { findMany: jest.Mock } };

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: unknown, fn: (db: unknown) => unknown) => fn(mockDb)),
}));

import { listRiskOptions } from '@/app-layer/usecases/risk-picker';
import { makeRequestContext } from '../helpers/make-context';

describe('listRiskOptions', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns the tenant risks as { id, title }, bounded + non-deleted', async () => {
        mockDb.risk.findMany.mockResolvedValue([
            { id: 'r1', title: 'SQLi' },
            { id: 'r2', title: 'Phishing' },
        ]);
        const ctx = makeRequestContext('EDITOR', { tenantId: 't1' });

        const out = await listRiskOptions(ctx);

        expect(out).toEqual([
            { id: 'r1', title: 'SQLi' },
            { id: 'r2', title: 'Phishing' },
        ]);
        const args = mockDb.risk.findMany.mock.calls[0][0];
        expect(args.where).toMatchObject({ tenantId: 't1', deletedAt: null });
        expect(args.select).toEqual({ id: true, title: true });
        expect(args.take).toBe(500);
    });

    it('is read-gated (a context without read access is rejected)', async () => {
        const ctx = makeRequestContext('EDITOR', { tenantId: 't1' });
        // Strip read permission to prove the assertion fires.
        ctx.permissions.canRead = false;
        await expect(listRiskOptions(ctx)).rejects.toThrow();
    });
});

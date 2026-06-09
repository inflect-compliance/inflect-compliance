/* eslint-disable @typescript-eslint/no-explicit-any -- test-mock pattern. */
/** SP-5 — sync-health aggregation. */
const mockDb = {
    integrationConnection: { findMany: jest.fn() },
    integrationExecution: { findMany: jest.fn() },
    integrationSyncMapping: { findMany: jest.fn() },
    policy: { count: jest.fn() },
};
jest.mock('@/lib/db-context', () => ({
    __esModule: true,
    runInTenantContext: (_ctx: any, fn: (db: any) => any) => fn(mockDb),
}));

import { getSharePointHealth } from '@/app-layer/integrations/providers/sharepoint/health';

const admin = { tenantId: 't1', userId: 'u1', permissions: { canAdmin: true } } as any;
const reader = { tenantId: 't1', userId: 'u2', permissions: { canAdmin: false } } as any;

beforeEach(() => jest.clearAllMocks());

it('rejects a non-admin', async () => {
    await expect(getSharePointHealth(reader)).rejects.toBeDefined();
});

it('aggregates connections, executions, coverage + policy links', async () => {
    mockDb.integrationConnection.findMany.mockResolvedValue([
        { id: 'c1', name: 'SP', lastTestedAt: new Date('2026-01-01'), lastTestStatus: 'ok' },
    ]);
    mockDb.integrationExecution.findMany.mockResolvedValue([
        { id: 'e1', automationKey: 'sharepoint.audit_pack_export', status: 'PASSED', triggeredBy: 'manual', executedAt: new Date('2026-02-01'), durationMs: 120 },
    ]);
    mockDb.integrationSyncMapping.findMany.mockResolvedValue([
        { syncStatus: 'SYNCED' }, { syncStatus: 'SYNCED' }, { syncStatus: 'STALE' }, { syncStatus: 'FAILED' },
    ]);
    mockDb.policy.count.mockResolvedValue(3);

    const h = await getSharePointHealth(admin);
    expect(h.connections).toHaveLength(1);
    expect(h.connections[0].lastTestedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(h.executions[0].automationKey).toBe('sharepoint.audit_pack_export');
    expect(h.evidenceCoverage).toEqual({ synced: 2, stale: 1, failed: 1, total: 4 });
    expect(h.policyLinks).toBe(3);
});

/* eslint-disable @typescript-eslint/no-explicit-any -- test-mock pattern. */
/**
 * EI-1/EI-2 — provider + group-mapping usecase guards (permission + validation).
 */
const mockDb = {
    tenantIdentityProvider: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    entraGroupMapping: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
};
jest.mock('@/lib/db-context', () => ({
    runInTenantContext: (_ctx: any, fn: (db: any) => any) => fn(mockDb),
}));
jest.mock('@/app-layer/events/audit', () => ({ logEvent: jest.fn() }));

import { getEntraProvider, upsertEntraProvider } from '@/app-layer/usecases/entra-provider';
import {
    listEntraGroupMappings,
    createEntraGroupMapping,
} from '@/app-layer/usecases/entra-group-mappings';

const admin = { tenantId: 't1', userId: 'u1', permissions: { canAdmin: true } } as any;
const reader = { tenantId: 't1', userId: 'u2', permissions: { canAdmin: false } } as any;

beforeEach(() => jest.clearAllMocks());

describe('entra-provider usecases', () => {
    it('getEntraProvider rejects a non-admin', async () => {
        await expect(getEntraProvider(reader)).rejects.toBeDefined();
    });
    it('upsertEntraProvider rejects an invalid config (non-uuid)', async () => {
        await expect(upsertEntraProvider(admin, { aadTenantId: 'x', clientId: 'y' })).rejects.toBeDefined();
    });
});

describe('entra-group-mappings usecases', () => {
    it('listEntraGroupMappings rejects a non-admin', async () => {
        await expect(listEntraGroupMappings(reader)).rejects.toBeDefined();
    });
    it('createEntraGroupMapping rejects a non-GUID group id', async () => {
        await expect(
            createEntraGroupMapping(admin, { aadGroupId: 'not-a-guid', icRole: 'READER' }),
        ).rejects.toBeDefined();
    });
    it('createEntraGroupMapping requires a configured provider', async () => {
        mockDb.tenantIdentityProvider.findFirst.mockResolvedValue(null);
        await expect(
            createEntraGroupMapping(admin, {
                aadGroupId: '11111111-1111-4111-8111-111111111111',
                icRole: 'EDITOR',
            }),
        ).rejects.toThrow(/provider/i);
    });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- test-mock pattern. */
/** EI-2 — entra-group-mappings usecase: admin gate, CRUD, conflict, not-found. */
import { Prisma } from '@prisma/client';

const mockDb = {
    tenantEntraGroupMapping: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
};
jest.mock('@/lib/db-context', () => ({
    runInTenantContext: (_ctx: any, fn: (db: any) => any) => fn(mockDb),
}));
jest.mock('@/app-layer/events/audit', () => ({ logEvent: jest.fn() }));

import {
    listEntraGroupMappings,
    createEntraGroupMapping,
    updateEntraGroupMapping,
    deleteEntraGroupMapping,
} from '@/app-layer/usecases/entra-group-mappings';

const admin = { tenantId: 't1', userId: 'u1', permissions: { canAdmin: true } } as any;
const reader = { tenantId: 't1', userId: 'u2', permissions: { canAdmin: false } } as any;
const GUID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => jest.clearAllMocks());

describe('entra-group-mappings usecase', () => {
    it('every operation rejects a non-admin', async () => {
        await expect(listEntraGroupMappings(reader)).rejects.toBeDefined();
        await expect(createEntraGroupMapping(reader, {})).rejects.toBeDefined();
        await expect(updateEntraGroupMapping(reader, 'm1', {})).rejects.toBeDefined();
        await expect(deleteEntraGroupMapping(reader, 'm1')).rejects.toBeDefined();
    });

    it('rejects an invalid create (bad GUID)', async () => {
        await expect(
            createEntraGroupMapping(admin, { aadGroupId: 'not-a-guid', role: 'READER' }),
        ).rejects.toBeDefined();
    });

    it('rejects mapping to OWNER (not a mappable role)', async () => {
        await expect(
            createEntraGroupMapping(admin, { aadGroupId: GUID, role: 'OWNER' }),
        ).rejects.toBeDefined();
    });

    it('creates a valid mapping', async () => {
        mockDb.tenantEntraGroupMapping.create.mockResolvedValue({ id: 'm1', aadGroupId: GUID, role: 'EDITOR' });
        const r = await createEntraGroupMapping(admin, { aadGroupId: GUID, role: 'EDITOR', priority: 5 });
        expect(r.id).toBe('m1');
        expect(mockDb.tenantEntraGroupMapping.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ tenantId: 't1', role: 'EDITOR', priority: 5 }) }),
        );
    });

    it('maps a duplicate (P2002) to a 409 conflict', async () => {
        mockDb.tenantEntraGroupMapping.create.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' } as any),
        );
        await expect(
            createEntraGroupMapping(admin, { aadGroupId: GUID, role: 'READER' }),
        ).rejects.toMatchObject({ message: expect.stringMatching(/already exists/i) });
    });

    it('update throws not-found for an unknown id', async () => {
        mockDb.tenantEntraGroupMapping.findFirst.mockResolvedValue(null);
        await expect(updateEntraGroupMapping(admin, 'missing', { role: 'ADMIN' })).rejects.toBeDefined();
    });

    it('updates role + priority of an existing mapping', async () => {
        mockDb.tenantEntraGroupMapping.findFirst.mockResolvedValue({ id: 'm1', aadGroupId: GUID, role: 'READER', priority: 0 });
        mockDb.tenantEntraGroupMapping.update.mockResolvedValue({ id: 'm1', aadGroupId: GUID, role: 'ADMIN', priority: 7 });
        const r = await updateEntraGroupMapping(admin, 'm1', { role: 'ADMIN', priority: 7 });
        expect(r.role).toBe('ADMIN');
    });

    it('delete throws not-found for an unknown id', async () => {
        mockDb.tenantEntraGroupMapping.findFirst.mockResolvedValue(null);
        await expect(deleteEntraGroupMapping(admin, 'missing')).rejects.toBeDefined();
    });

    it('deletes an existing mapping', async () => {
        mockDb.tenantEntraGroupMapping.findFirst.mockResolvedValue({ id: 'm1', aadGroupId: GUID, role: 'READER' });
        mockDb.tenantEntraGroupMapping.delete.mockResolvedValue({ id: 'm1' });
        const r = await deleteEntraGroupMapping(admin, 'm1');
        expect(r).toEqual({ id: 'm1' });
        expect(mockDb.tenantEntraGroupMapping.delete).toHaveBeenCalled();
    });
});

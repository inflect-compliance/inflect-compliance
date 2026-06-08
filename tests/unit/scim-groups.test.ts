/* eslint-disable @typescript-eslint/no-explicit-any -- test-mock pattern. */
/**
 * EI-3 — SCIM Groups: create/patch reconcile memberships through the EI-2 mapper.
 */
const mockDb = {
    scimGroup: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    entraGroupMapping: { updateMany: jest.fn() },
    userIdentityLink: { findMany: jest.fn() },
};
jest.mock('@/lib/db-context', () => ({
    runInTenantContext: (_ctx: any, fn: (db: any) => any) => fn(mockDb),
}));
jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: { userIdentityLink: { findMany: (...a: any[]) => mockDb.userIdentityLink.findMany(...a) } },
}));
const applyMock = jest.fn();
jest.mock('@/app-layer/services/entra-group-mapper', () => ({
    applyEntraGroupMapping: (...a: unknown[]) => applyMock(...a),
}));

import { scimCreateGroup, scimPatchGroup } from '@/app-layer/usecases/scim-groups';

const ctx = { tenantId: 't1' };
beforeEach(() => jest.clearAllMocks());

describe('scimCreateGroup', () => {
    it('creates the group + reconciles resolved members', async () => {
        mockDb.userIdentityLink.findMany.mockResolvedValue([{ userId: 'u1' }]);
        mockDb.scimGroup.create.mockResolvedValue({ id: 'g1', externalId: 'oid1', displayName: 'Leads', membersJson: [] });
        mockDb.scimGroup.findMany.mockResolvedValue([{ externalId: 'oid1' }]);

        await scimCreateGroup(ctx, { externalId: 'oid1', displayName: 'Leads', members: [{ value: 'ext-u1' }] });

        expect(mockDb.scimGroup.create).toHaveBeenCalled();
        // the added user is reconciled with their full group set
        expect(applyMock).toHaveBeenCalledWith('u1', 't1', ['oid1'], 'scim');
    });
});

describe('scimPatchGroup', () => {
    it('add members → resolves + reconciles each added user', async () => {
        mockDb.scimGroup.findFirst.mockResolvedValue({ id: 'g1', externalId: 'oid1', displayName: 'Leads', memberIds: [] });
        mockDb.userIdentityLink.findMany.mockResolvedValue([{ userId: 'u2' }]);
        mockDb.scimGroup.update.mockResolvedValue({});
        mockDb.scimGroup.findMany.mockResolvedValue([{ externalId: 'oid1' }]);

        await scimPatchGroup(ctx, 'g1', [{ op: 'add', path: 'members', value: [{ value: 'ext-u2' }] }]);

        expect(applyMock).toHaveBeenCalledWith('u2', 't1', ['oid1'], 'scim');
    });

    it('remove members → reconciles the removed user (now in fewer groups)', async () => {
        mockDb.scimGroup.findFirst.mockResolvedValue({ id: 'g1', externalId: 'oid1', displayName: 'Leads', memberIds: ['u3'] });
        mockDb.userIdentityLink.findMany.mockResolvedValue([{ userId: 'u3' }]);
        mockDb.scimGroup.update.mockResolvedValue({});
        mockDb.scimGroup.findMany.mockResolvedValue([]); // no longer in any group

        await scimPatchGroup(ctx, 'g1', [{ op: 'remove', path: 'members', value: [{ value: 'ext-u3' }] }]);

        expect(applyMock).toHaveBeenCalledWith('u3', 't1', [], 'scim');
    });

    it('displayName replace → syncs the linked mapping name, no membership churn', async () => {
        mockDb.scimGroup.findFirst.mockResolvedValue({ id: 'g1', externalId: 'oid1', displayName: 'Old', memberIds: [] });
        mockDb.scimGroup.update.mockResolvedValue({});

        await scimPatchGroup(ctx, 'g1', [{ op: 'replace', path: 'displayName', value: 'New' }]);

        expect(mockDb.entraGroupMapping.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: { aadGroupName: 'New' } }),
        );
        expect(applyMock).not.toHaveBeenCalled();
    });
});

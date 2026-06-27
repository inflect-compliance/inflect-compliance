/**
 * Unit coverage for the policy evidence-to-retain link usecases
 * (src/app-layer/usecases/policy-evidence.ts). DB mocked.
 */
import { buildRequestContext } from '../helpers/factories';

const mockDb = {
    policy: { findFirst: jest.fn() },
    evidence: { findFirst: jest.fn() },
    policyEvidenceItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
};

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: unknown, fn: (db: unknown) => unknown) => fn(mockDb)),
}));
jest.mock('@/app-layer/events/audit', () => ({ logEvent: jest.fn() }));

import {
    listPolicyEvidenceItems,
    addPolicyEvidenceItem,
    linkPolicyEvidenceItem,
    unlinkPolicyEvidenceItem,
} from '@/app-layer/usecases/policy-evidence';

const ctx = buildRequestContext({ role: 'ADMIN' }) as any;

beforeEach(() => jest.clearAllMocks());

describe('listPolicyEvidenceItems', () => {
    it('lists items scoped to tenant + policy', async () => {
        mockDb.policyEvidenceItem.findMany.mockResolvedValue([{ id: 'i1', label: 'X' }]);
        const out = await listPolicyEvidenceItems(ctx, 'p1');
        expect(out).toHaveLength(1);
        const arg = mockDb.policyEvidenceItem.findMany.mock.calls[0][0];
        expect(arg.where).toMatchObject({ tenantId: ctx.tenantId, policyId: 'p1' });
    });
});

describe('addPolicyEvidenceItem', () => {
    it('rejects empty labels', async () => {
        await expect(addPolicyEvidenceItem(ctx, 'p1', '   ')).rejects.toThrow();
    });
    it('creates with next sortOrder', async () => {
        mockDb.policy.findFirst.mockResolvedValue({ id: 'p1' });
        mockDb.policyEvidenceItem.findFirst.mockResolvedValue({ sortOrder: 4 });
        mockDb.policyEvidenceItem.create.mockResolvedValue({ id: 'i9' });
        await addPolicyEvidenceItem(ctx, 'p1', 'New item');
        expect(mockDb.policyEvidenceItem.create.mock.calls[0][0].data.sortOrder).toBe(5);
    });
});

describe('linkPolicyEvidenceItem', () => {
    it('links when item + evidence both belong to the tenant', async () => {
        mockDb.policyEvidenceItem.findFirst.mockResolvedValue({ id: 'i1' });
        mockDb.evidence.findFirst.mockResolvedValue({ id: 'e1', title: 'Reg' });
        mockDb.policyEvidenceItem.updateMany.mockResolvedValue({ count: 1 });
        const res = await linkPolicyEvidenceItem(ctx, 'p1', 'i1', 'e1');
        expect(res).toEqual({ itemId: 'i1', evidenceId: 'e1' });
        expect(mockDb.policyEvidenceItem.updateMany.mock.calls[0][0].data).toEqual({ evidenceId: 'e1' });
    });
    it('throws when the item is not found', async () => {
        mockDb.policyEvidenceItem.findFirst.mockResolvedValue(null);
        await expect(linkPolicyEvidenceItem(ctx, 'p1', 'missing', 'e1')).rejects.toThrow();
    });
    it('throws when the evidence is foreign', async () => {
        mockDb.policyEvidenceItem.findFirst.mockResolvedValue({ id: 'i1' });
        mockDb.evidence.findFirst.mockResolvedValue(null);
        await expect(linkPolicyEvidenceItem(ctx, 'p1', 'i1', 'foreign')).rejects.toThrow();
        expect(mockDb.policyEvidenceItem.updateMany).not.toHaveBeenCalled();
    });
});

describe('unlinkPolicyEvidenceItem', () => {
    it('clears the evidence link', async () => {
        mockDb.policyEvidenceItem.findFirst.mockResolvedValue({ id: 'i1', evidenceId: 'e1' });
        mockDb.policyEvidenceItem.updateMany.mockResolvedValue({ count: 1 });
        await unlinkPolicyEvidenceItem(ctx, 'p1', 'i1');
        expect(mockDb.policyEvidenceItem.updateMany.mock.calls[0][0].data).toEqual({ evidenceId: null });
    });
});

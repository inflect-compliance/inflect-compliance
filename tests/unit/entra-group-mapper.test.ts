/* eslint-disable @typescript-eslint/no-explicit-any -- test-mock pattern. */
/**
 * EI-2 — group mapper write paths. The headline case is the
 * privilege-escalation invariant: a manually-provisioned membership is NEVER
 * mutated by the engine.
 */
const mockDb = {
    tenantMembership: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
};
jest.mock('@/lib/db-context', () => ({
    runInTenantContext: (_ctx: any, fn: (db: any) => any) => fn(mockDb),
}));
const evalMock = jest.fn();
jest.mock('@/app-layer/services/entra-group-evaluator', () => ({
    evaluateGroupMapping: (...a: unknown[]) => evalMock(...a),
}));

import { applyEntraGroupMapping } from '@/app-layer/services/entra-group-mapper';

beforeEach(() => jest.clearAllMocks());

describe('applyEntraGroupMapping', () => {
    it('first sign-in + match → creates an auto-managed membership', async () => {
        evalMock.mockResolvedValue({ matched: true, icRole: 'EDITOR', customRoleId: null, matchedMappingId: 'm1' });
        mockDb.tenantMembership.findFirst.mockResolvedValue(null);

        const r = await applyEntraGroupMapping('u1', 't1', ['g1']);
        expect(r.outcome).toBe('created');
        expect(mockDb.tenantMembership.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    role: 'EDITOR', provisionedByEntraGroup: true, lastEntraGroupMappingId: 'm1',
                }),
            }),
        );
    });

    it('first sign-in + deny → no membership created', async () => {
        evalMock.mockResolvedValue({ matched: false, deny: true });
        mockDb.tenantMembership.findFirst.mockResolvedValue(null);
        const r = await applyEntraGroupMapping('u1', 't1', ['gX']);
        expect(r).toEqual({ outcome: 'denied', deny: true });
        expect(mockDb.tenantMembership.create).not.toHaveBeenCalled();
    });

    it('returning auto-managed + role changed → updates', async () => {
        evalMock.mockResolvedValue({ matched: true, icRole: 'ADMIN', customRoleId: null, matchedMappingId: 'm2' });
        mockDb.tenantMembership.findFirst.mockResolvedValue({
            id: 'mem1', role: 'READER', customRoleId: null, provisionedByEntraGroup: true, status: 'ACTIVE',
        });
        const r = await applyEntraGroupMapping('u1', 't1', ['g1']);
        expect(r.outcome).toBe('updated');
        expect(mockDb.tenantMembership.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ role: 'ADMIN' }) }),
        );
    });

    // ── THE INVARIANT ──
    it('returning MANUAL membership → never mutated (privilege-escalation guard)', async () => {
        evalMock.mockResolvedValue({ matched: true, icRole: 'READER', customRoleId: null, matchedMappingId: 'm3' });
        mockDb.tenantMembership.findFirst.mockResolvedValue({
            id: 'mem1', role: 'ADMIN', customRoleId: null, provisionedByEntraGroup: false, status: 'ACTIVE',
        });
        const r = await applyEntraGroupMapping('u1', 't1', ['g1']);
        expect(r.outcome).toBe('skipped_manual');
        expect(mockDb.tenantMembership.update).not.toHaveBeenCalled();
    });

    it('returning auto-managed + deny → deactivates', async () => {
        evalMock.mockResolvedValue({ matched: false, deny: true });
        mockDb.tenantMembership.findFirst.mockResolvedValue({
            id: 'mem1', role: 'EDITOR', customRoleId: null, provisionedByEntraGroup: true, status: 'ACTIVE',
        });
        const r = await applyEntraGroupMapping('u1', 't1', ['gX']);
        expect(r.outcome).toBe('deactivated');
        expect(mockDb.tenantMembership.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'DEACTIVATED' }) }),
        );
    });

    it('no match + gate off → no_change (manual retention)', async () => {
        evalMock.mockResolvedValue(null);
        mockDb.tenantMembership.findFirst.mockResolvedValue({
            id: 'mem1', role: 'EDITOR', customRoleId: null, provisionedByEntraGroup: true, status: 'ACTIVE',
        });
        const r = await applyEntraGroupMapping('u1', 't1', ['gX']);
        expect(r.outcome).toBe('no_change');
        expect(mockDb.tenantMembership.update).not.toHaveBeenCalled();
    });
});

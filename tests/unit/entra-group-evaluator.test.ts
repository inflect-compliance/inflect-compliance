/* eslint-disable @typescript-eslint/no-explicit-any -- test-mock pattern. */
/**
 * EI-2 — group evaluator: pure pick logic + the gate semantics.
 */
import { pickMapping, evaluateGroupMapping, type MappingRow } from '@/app-layer/services/entra-group-evaluator';

const M = (over: Partial<MappingRow>): MappingRow => ({
    id: 'm', aadGroupId: 'g', icRole: 'READER', customRoleId: null, priority: 0, isActive: true, ...over,
});

describe('pickMapping (pure)', () => {
    it('returns the single match', () => {
        const m = M({ id: 'm1', aadGroupId: 'g1', icRole: 'EDITOR' });
        expect(pickMapping([m], ['g1'])?.id).toBe('m1');
    });
    it('highest priority wins among multiple matches', () => {
        const lo = M({ id: 'lo', aadGroupId: 'g1', priority: 1 });
        const hi = M({ id: 'hi', aadGroupId: 'g2', priority: 9 });
        expect(pickMapping([lo, hi], ['g1', 'g2'])?.id).toBe('hi');
    });
    it('tie on priority → higher role severity wins (ADMIN > EDITOR)', () => {
        const editor = M({ id: 'ed', aadGroupId: 'g1', priority: 5, icRole: 'EDITOR' });
        const admin = M({ id: 'ad', aadGroupId: 'g2', priority: 5, icRole: 'ADMIN' });
        expect(pickMapping([editor, admin], ['g1', 'g2'])?.id).toBe('ad');
    });
    it('skips inactive mappings', () => {
        const off = M({ id: 'off', aadGroupId: 'g1', isActive: false, priority: 9 });
        const on = M({ id: 'on', aadGroupId: 'g2', isActive: true, priority: 1 });
        expect(pickMapping([off, on], ['g1', 'g2'])?.id).toBe('on');
    });
    it('returns null when no group matches', () => {
        expect(pickMapping([M({ aadGroupId: 'g1' })], ['gX'])).toBeNull();
    });
});

describe('evaluateGroupMapping (gate semantics)', () => {
    const ctx = { tenantId: 't1' } as any;
    const makeDb = (mappings: MappingRow[], enforce: boolean) => ({
        entraGroupMapping: { findMany: jest.fn().mockResolvedValue(mappings) },
        tenantIdentityProvider: {
            findFirst: jest.fn().mockResolvedValue({
                configJson: {
                    aadTenantId: '11111111-1111-4111-8111-111111111111',
                    clientId: '22222222-2222-4222-8222-222222222222',
                    groupClaimMode: 'securityGroup',
                    enforceGroupGate: enforce,
                },
            }),
        },
    });

    it('match → returns role + mapping id', async () => {
        const db = makeDb([M({ id: 'm1', aadGroupId: 'g1', icRole: 'ADMIN' })], false);
        const r = await evaluateGroupMapping(db as any, ctx, ['g1']);
        expect(r).toMatchObject({ matched: true, icRole: 'ADMIN', matchedMappingId: 'm1' });
    });
    it('no match + enforceGroupGate → deny', async () => {
        const db = makeDb([M({ aadGroupId: 'g1' })], true);
        expect(await evaluateGroupMapping(db as any, ctx, ['gX'])).toEqual({ matched: false, deny: true });
    });
    it('no match + gate off → null (existing role preserved)', async () => {
        const db = makeDb([M({ aadGroupId: 'g1' })], false);
        expect(await evaluateGroupMapping(db as any, ctx, ['gX'])).toBeNull();
    });
    it('empty groups → null (never deny — fail safe)', async () => {
        const db = makeDb([M({ aadGroupId: 'g1' })], true);
        expect(await evaluateGroupMapping(db as any, ctx, [])).toBeNull();
    });
});

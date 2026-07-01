/**
 * Recovery-priority derivation — the transparent BIA ordering. Pure
 * function, so these assertions pin the documented precedence
 * (criticality → MTPD asc → RTO asc → id) with no DB.
 */
import { deriveRecoveryPriority, rankFor, CRITICALITY_RANK } from '@/app-layer/services/bia-recovery-priority';

const c = (id: string, criticality: string, mtpdHours: number | null, rtoHours: number | null = null) => ({
    id,
    criticality,
    mtpdHours,
    rtoHours,
});

describe('deriveRecoveryPriority', () => {
    it('orders by criticality first (CRITICAL recovers before LOW)', () => {
        const r = deriveRecoveryPriority([c('low', 'LOW', 1), c('crit', 'CRITICAL', 100)]);
        expect(rankFor('crit', r)!.rank).toBe(1);
        expect(rankFor('low', r)!.rank).toBe(2);
    });

    it('within the same criticality, tighter MTPD recovers first', () => {
        const r = deriveRecoveryPriority([c('slow', 'HIGH', 24), c('tight', 'HIGH', 2)]);
        expect(rankFor('tight', r)!.rank).toBe(1);
        expect(rankFor('slow', r)!.rank).toBe(2);
    });

    it('missing MTPD sorts last within a criticality band', () => {
        const r = deriveRecoveryPriority([c('none', 'HIGH', null), c('has', 'HIGH', 8)]);
        expect(rankFor('has', r)!.rank).toBe(1);
        expect(rankFor('none', r)!.rank).toBe(2);
    });

    it('breaks an MTPD tie by ascending RTO', () => {
        const r = deriveRecoveryPriority([c('rtoBig', 'MEDIUM', 4, 12), c('rtoSmall', 'MEDIUM', 4, 3)]);
        expect(rankFor('rtoSmall', r)!.rank).toBe(1);
    });

    it('assigns dense 1-based ranks and a rationale naming the inputs', () => {
        const r = deriveRecoveryPriority([c('a', 'CRITICAL', 2, 1), c('b', 'HIGH', null)]);
        expect(r.map((x) => x.rank).sort()).toEqual([1, 2]);
        expect(rankFor('a', r)!.rationale).toMatch(/CRITICAL criticality · MTPD 2h · RTO 1h → recovery #1/);
        expect(rankFor('b', r)!.rationale).toMatch(/no MTPD set/);
    });

    it('is a stable, pure ordering (unknown criticality sorts last)', () => {
        const r = deriveRecoveryPriority([c('x', 'WEIRD', 1), c('y', 'LOW', 50)]);
        expect(rankFor('y', r)!.rank).toBe(1); // LOW (rank 1) beats unknown (rank 0)
        expect(CRITICALITY_RANK.CRITICAL).toBeGreaterThan(CRITICALITY_RANK.LOW);
    });
});

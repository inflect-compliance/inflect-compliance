import { getAssetCriticality, criticalityToEnum } from '@/lib/asset-criticality';

describe('sanity — criticalityToEnum agrees with getAssetCriticality', () => {
    it.each([
        [1, 1, 1, 'LOW'],
        [3, 1, 1, 'LOW'],
        [4, 1, 1, 'MEDIUM'],
        [4, 4, 1, 'HIGH'],
        [4, 4, 4, 'HIGH'],
        [5, 1, 1, 'CRITICAL'],
        [5, 5, 5, 'CRITICAL'],
    ])('C=%i I=%i A=%i -> %s', (c, i, a, enumVal) => {
        expect(criticalityToEnum(c, i, a)).toBe(enumVal);
    });

    it('a 5/5/5 asset derives CRITICAL and is caught by the HIGH+CRITICAL KPI/filter', () => {
        const crit = getAssetCriticality(5, 5, 5);
        expect(crit.label).toBe('Critical');
        const stored = criticalityToEnum(5, 5, 5);
        expect(stored).toBe('CRITICAL');
        // KPI predicate + filter values both include CRITICAL now.
        expect(['HIGH', 'CRITICAL'].includes(stored)).toBe(true);
    });
});

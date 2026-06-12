/**
 * B10 — risk-analytics usecase unit test.
 *
 * Mocks the prisma layer and asserts the computed shape:
 *
 *   • Total ALE = Σ (sleAmount × aroAmount).
 *   • Average ALE = Σ ALE / quantifiedCount.
 *   • Max single ALE = max ALE across the quantified subset.
 *   • Risks with NULL sleAmount or aroAmount are counted in
 *     `totalCount` but EXCLUDED from `quantifiedCount`, totals,
 *     and `topByAle`.
 *   • Top-N is ALE-descending and truncated at 10.
 *   • Category distribution buckets NULL categories under
 *     "(uncategorised)".
 *   • Loss-exceedance points are emitted in descending ALE order
 *     with `exceedanceFraction = (rank+1) / quantifiedCount`.
 */
import { getRiskQuantitativeAnalytics } from '@/app-layer/usecases/risk-analytics';
import { makeRequestContext } from '../helpers/make-context';

const findManyMock = jest.fn();

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: async <T,>(
        _ctx: unknown,
        fn: (db: unknown) => Promise<T>,
    ) => {
        const db = {
            risk: { findMany: findManyMock },
        };
        return fn(db);
    },
}));

jest.mock('@/app-layer/policies/common', () => ({
    assertCanRead: jest.fn(),
}));

describe('B10 — getRiskQuantitativeAnalytics', () => {
    beforeEach(() => {
        findManyMock.mockReset();
    });

    it('returns zero-state when no risks exist', async () => {
        findManyMock.mockResolvedValue([]);
        const out = await getRiskQuantitativeAnalytics(makeRequestContext());
        expect(out.totals.totalCount).toBe(0);
        expect(out.totals.quantifiedCount).toBe(0);
        expect(out.totals.totalAle).toBe(0);
        expect(out.totals.avgAle).toBeNull();
        expect(out.totals.maxAle).toBeNull();
        expect(out.topByAle).toEqual([]);
        expect(out.byCategory).toEqual([]);
        expect(out.coverageSketch).toEqual([]);
    });

    it('excludes risks without both SLE and ARO from totals', async () => {
        findManyMock.mockResolvedValue([
            { id: '1', title: 'A', category: 'Cyber', sleAmount: 1000, aroAmount: 2 },
            { id: '2', title: 'B', category: 'Cyber', sleAmount: null, aroAmount: 1 },
            { id: '3', title: 'C', category: 'Privacy', sleAmount: 500, aroAmount: null },
        ]);
        const out = await getRiskQuantitativeAnalytics(makeRequestContext());
        expect(out.totals.totalCount).toBe(3);
        expect(out.totals.quantifiedCount).toBe(1);
        expect(out.totals.totalAle).toBe(2000);
        expect(out.totals.avgAle).toBe(2000);
        expect(out.totals.maxAle).toBe(2000);
        expect(out.topByAle).toHaveLength(1);
        expect(out.topByAle[0].id).toBe('1');
    });

    it('computes totals, top-N, category split, and LEC for a mixed portfolio', async () => {
        findManyMock.mockResolvedValue([
            { id: 'r1', title: 'Phishing', category: 'Cyber', sleAmount: 10_000, aroAmount: 0.5 }, // ALE 5,000
            { id: 'r2', title: 'Vendor outage', category: 'Operations', sleAmount: 50_000, aroAmount: 0.1 }, // ALE 5,000
            { id: 'r3', title: 'Breach', category: 'Cyber', sleAmount: 100_000, aroAmount: 0.2 }, // ALE 20,000
            { id: 'r4', title: 'Insider', category: null, sleAmount: 5_000, aroAmount: 1 }, // ALE 5,000
            { id: 'r5', title: 'Qualitative-only', category: 'Cyber', sleAmount: null, aroAmount: null },
        ]);

        const out = await getRiskQuantitativeAnalytics(makeRequestContext());

        expect(out.totals.totalCount).toBe(5);
        expect(out.totals.quantifiedCount).toBe(4);
        expect(out.totals.totalAle).toBe(35_000);
        expect(out.totals.avgAle).toBe(8_750);
        expect(out.totals.maxAle).toBe(20_000);

        // Top-N is ALE desc; the breach leads.
        expect(out.topByAle[0].id).toBe('r3');
        expect(out.topByAle[0].ale).toBe(20_000);

        // Categories rolled up; null becomes "(uncategorised)".
        const cats = Object.fromEntries(
            out.byCategory.map((c) => [c.category, c]),
        );
        expect(cats['Cyber'].count).toBe(2);
        expect(cats['Cyber'].totalAle).toBe(25_000);
        expect(cats['Operations'].count).toBe(1);
        expect(cats['(uncategorised)'].count).toBe(1);

        // LEC: 4 points, all with non-decreasing fraction.
        expect(out.coverageSketch).toHaveLength(4);
        expect(out.coverageSketch[0].exceedanceFraction).toBe(0.25);
        expect(out.coverageSketch[3].exceedanceFraction).toBe(1);
        // First point's threshold == max ALE (curve emitted desc).
        expect(out.coverageSketch[0].threshold).toBe(20_000);
    });

    it('caps topByAle at 10 entries', async () => {
        const rows = Array.from({ length: 25 }, (_, i) => ({
            id: `r${i}`,
            title: `Risk ${i}`,
            category: 'Cyber',
            sleAmount: 1000,
            aroAmount: i + 1, // ALE varies for sortability
        }));
        findManyMock.mockResolvedValue(rows);
        const out = await getRiskQuantitativeAnalytics(makeRequestContext());
        expect(out.topByAle).toHaveLength(10);
        // Largest ARO = 25 → ALE 25,000.
        expect(out.topByAle[0].ale).toBe(25_000);
    });
});

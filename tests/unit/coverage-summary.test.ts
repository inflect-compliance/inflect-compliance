/* eslint-disable @typescript-eslint/no-explicit-any -- test
 * mocks, fixtures, and adapter shims that mirror runtime contracts
 * (Prisma extensions, NextRequest mocks, JSON-loaded fixtures,
 * spy harnesses). Per-line typing has poor cost/benefit ratio in
 * test files; the file-level disable is the codebase's standard
 * pattern for these surfaces (see also
 * tests/guards/helm-chart-foundation.test.ts and
 * tests/integration/audit-middleware.test.ts). */
/**
 * Unit test: coverageSummary usecase — shape and percentage calculations.
 *
 * Uses a mock Prisma client to validate:
 *   - Return shape has all expected fields
 *   - Percentage calculations are correct (division, rounding)
 *   - Edge cases: empty tenant (all zeros), full coverage (100%)
 */

import { coverageSummary } from '../../src/app-layer/usecases/traceability';

// ── Mock helpers ──────────────────────────────────────────────────

function mockDb(overrides: {
    riskCount?: number;
    controlCount?: number;
    assetCount?: number;
    policyCount?: number;
    risksWithControls?: string[];
    controlsWithRisks?: string[];
    assetsWithControls?: string[];
    policiesWithControls?: string[];
    unmappedRisks?: any[];
    uncoveredCriticalAssets?: any[];
    hotControls?: any[];
    hotControlDetails?: any[];
}) {
    const {
        riskCount = 10,
        controlCount = 20,
        assetCount = 15,
        policyCount = 0,
        risksWithControls = ['r1', 'r2', 'r3'],
        controlsWithRisks = ['c1', 'c2'],
        assetsWithControls = ['a1', 'a2', 'a3', 'a4'],
        policiesWithControls = [],
        unmappedRisks = [],
        uncoveredCriticalAssets = [],
        hotControls = [],
        hotControlDetails = [],
    } = overrides;

    return {
        risk: {
            count: jest.fn().mockResolvedValue(riskCount),
            findMany: jest.fn().mockResolvedValue(unmappedRisks),
        },
        control: {
            count: jest.fn().mockResolvedValue(controlCount),
            findMany: jest.fn().mockResolvedValue(hotControlDetails),
        },
        asset: {
            count: jest.fn().mockResolvedValue(assetCount),
            findMany: jest.fn().mockResolvedValue(uncoveredCriticalAssets),
        },
        policy: {
            count: jest.fn().mockResolvedValue(policyCount),
        },
        policyControlLink: {
            findMany: jest.fn().mockResolvedValue(policiesWithControls.map(id => ({ policyId: id }))),
        },
        riskControl: {
            findMany: jest.fn()
                .mockResolvedValueOnce(risksWithControls.map(id => ({ riskId: id })))
                .mockResolvedValueOnce(controlsWithRisks.map(id => ({ controlId: id }))),
            groupBy: jest.fn().mockResolvedValue(hotControls),
        },
        controlAsset: {
            findMany: jest.fn().mockResolvedValue(assetsWithControls.map(id => ({ assetId: id }))),
        },
    };
}

// We need to mock runInTenantContext to pass our fake DB
jest.mock('../../src/lib/db-context', () => ({
    runInTenantContext: jest.fn((_ctx: any, fn: any) => fn(mockDbInstance)),
}));

let mockDbInstance: any;

describe('coverageSummary', () => {
    const ctx = { tenantId: 'tenant-1', userId: 'user-1', role: 'ADMIN', permissions: { canWrite: true } } as any;

    it('returns the correct shape', async () => {
        mockDbInstance = mockDb({});
        const result = await coverageSummary(ctx);

        expect(result).toHaveProperty('totalRisks');
        expect(result).toHaveProperty('totalControls');
        expect(result).toHaveProperty('totalAssets');
        expect(result).toHaveProperty('risksWithControlsCount');
        expect(result).toHaveProperty('risksWithControlsPct');
        expect(result).toHaveProperty('controlsWithRisksCount');
        expect(result).toHaveProperty('controlsWithRisksPct');
        expect(result).toHaveProperty('assetsWithControlsCount');
        expect(result).toHaveProperty('assetsWithControlsPct');
        expect(result).toHaveProperty('unmappedRisks');
        expect(result).toHaveProperty('uncoveredCriticalAssets');
        expect(result).toHaveProperty('hotControls');
    });

    it('calculates percentages correctly', async () => {
        mockDbInstance = mockDb({
            riskCount: 10,
            controlCount: 20,
            assetCount: 15,
            risksWithControls: ['r1', 'r2', 'r3'],
            controlsWithRisks: ['c1', 'c2'],
            assetsWithControls: ['a1', 'a2', 'a3', 'a4'],
        });
        const result = await coverageSummary(ctx);

        expect(result.risksWithControlsPct).toBe(30);    // 3/10 = 30%
        expect(result.controlsWithRisksPct).toBe(10);     // 2/20 = 10%
        expect(result.assetsWithControlsPct).toBe(27);    // 4/15 ≈ 27%
    });

    it('handles empty tenant (all zeros)', async () => {
        mockDbInstance = mockDb({
            riskCount: 0,
            controlCount: 0,
            assetCount: 0,
            risksWithControls: [],
            controlsWithRisks: [],
            assetsWithControls: [],
        });
        const result = await coverageSummary(ctx);

        expect(result.totalRisks).toBe(0);
        expect(result.totalControls).toBe(0);
        expect(result.totalAssets).toBe(0);
        expect(result.risksWithControlsPct).toBe(0);
        expect(result.controlsWithRisksPct).toBe(0);
        expect(result.assetsWithControlsPct).toBe(0);
    });

    it('handles 100% coverage', async () => {
        mockDbInstance = mockDb({
            riskCount: 3,
            controlCount: 3,
            assetCount: 3,
            risksWithControls: ['r1', 'r2', 'r3'],
            controlsWithRisks: ['c1', 'c2', 'c3'],
            assetsWithControls: ['a1', 'a2', 'a3'],
        });
        const result = await coverageSummary(ctx);

        expect(result.risksWithControlsPct).toBe(100);
        expect(result.controlsWithRisksPct).toBe(100);
        expect(result.assetsWithControlsPct).toBe(100);
    });
});

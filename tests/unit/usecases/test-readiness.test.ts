/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks. */
/**
 * Unit tests for `src/app-layer/usecases/test-readiness.ts` —
 * framework-aware test coverage scoring.
 *
 * Wave-10 / stage-3h branch coverage. `computeTestReadiness` is a
 * decision-dense aggregator with seven branches:
 *   - policy gate (assertCanReadTests)
 *   - per-framework `continue` when no controls map
 *   - testPlanCoverage formula vs `totalMapped === 0` guard
 *   - testRunCoverage formula vs `totalMapped === 0` guard
 *   - passRate formula vs `recentRuns.length === 0` guard
 *   - PASS filter vs non-PASS results
 *   - empty-frameworks fast path (returns [])
 *
 * Tests stub `runInTenantContext` to return per-table fixtures, then
 * assert the computed FrameworkTestReadiness shape per scenario.
 */

const policyCalls: string[] = [];

jest.mock('@/app-layer/policies/test.policies', () => ({
    assertCanReadTests: jest.fn(() => policyCalls.push('read-tests')),
}));

const tenantDb: any = {
    framework: { findMany: jest.fn() },
    controlRequirementLink: { findMany: jest.fn() },
    controlTestPlan: { findMany: jest.fn() },
    controlTestRun: { findMany: jest.fn() },
};

jest.mock('@/lib/db-context', () => {
    const actual = jest.requireActual('@/lib/db-context');
    return {
        ...actual,
        runInTenantContext: jest.fn(async (_ctx: any, cb: any) => cb(tenantDb)),
    };
});

import { computeTestReadiness } from '@/app-layer/usecases/test-readiness';
import { assertCanReadTests } from '@/app-layer/policies/test.policies';
import { makeRequestContext } from '../../helpers/make-context';

beforeEach(() => {
    policyCalls.length = 0;
    tenantDb.framework.findMany.mockReset();
    tenantDb.controlRequirementLink.findMany.mockReset();
    tenantDb.controlTestPlan.findMany.mockReset();
    tenantDb.controlTestRun.findMany.mockReset();
});

const ctx = makeRequestContext('ADMIN');

describe('computeTestReadiness — policy + empty paths', () => {
    it('invokes assertCanReadTests before any DB read', async () => {
        tenantDb.framework.findMany.mockResolvedValue([]);
        await computeTestReadiness(ctx);
        expect(assertCanReadTests).toHaveBeenCalledWith(ctx);
        // Policy is the first call — DB came after.
        expect(policyCalls).toEqual(['read-tests']);
    });

    it('returns [] when no frameworks exist', async () => {
        tenantDb.framework.findMany.mockResolvedValue([]);
        const out = await computeTestReadiness(ctx);
        expect(out).toEqual([]);
        // No per-framework queries should have been made.
        expect(tenantDb.controlRequirementLink.findMany).not.toHaveBeenCalled();
    });

    it('skips a framework whose ControlRequirementLink set is empty', async () => {
        tenantDb.framework.findMany.mockResolvedValue([
            { id: 'fw-1', key: 'iso', name: 'ISO 27001' },
        ]);
        tenantDb.controlRequirementLink.findMany.mockResolvedValue([]);
        const out = await computeTestReadiness(ctx);
        expect(out).toEqual([]);
        // The skip is the `continue` — no test-plan / test-run lookup
        // should fire for this framework.
        expect(tenantDb.controlTestPlan.findMany).not.toHaveBeenCalled();
        expect(tenantDb.controlTestRun.findMany).not.toHaveBeenCalled();
    });
});

describe('computeTestReadiness — coverage formulas', () => {
    function setupFw(opts: {
        controlIds: string[];
        planControlIds: string[];
        runs: Array<{ controlId: string; result: 'PASS' | 'FAIL' | 'INCONCLUSIVE' }>;
    }) {
        tenantDb.framework.findMany.mockResolvedValue([
            { id: 'fw-1', key: 'iso', name: 'ISO 27001' },
        ]);
        tenantDb.controlRequirementLink.findMany.mockResolvedValue(
            opts.controlIds.map((id) => ({ controlId: id })),
        );
        tenantDb.controlTestPlan.findMany.mockResolvedValue(
            opts.planControlIds.map((id, i) => ({ id: `plan-${i}`, controlId: id })),
        );
        tenantDb.controlTestRun.findMany.mockResolvedValue(
            opts.runs.map((r, i) => ({
                id: `run-${i}`,
                controlId: r.controlId,
                result: r.result,
            })),
        );
    }

    it('happy path — 4 controls, 3 plans, 2 recent runs (1 PASS) yields proportional coverage', async () => {
        setupFw({
            controlIds: ['c1', 'c2', 'c3', 'c4'],
            planControlIds: ['c1', 'c2', 'c3'],
            runs: [
                { controlId: 'c1', result: 'PASS' },
                { controlId: 'c2', result: 'FAIL' },
            ],
        });
        const out = await computeTestReadiness(ctx);
        expect(out).toEqual([
            {
                frameworkKey: 'iso',
                frameworkName: 'ISO 27001',
                totalMappedControls: 4,
                withTestPlan: 3,
                testPlanCoverage: 75,
                withRecentRun: 2,
                testRunCoverage: 50,
                passRate: 50,
                recentRuns: 2,
                recentPasses: 1,
            },
        ]);
    });

    it('zero plans + zero runs yields 0% across the board', async () => {
        // testPlanCoverage = 0, testRunCoverage = 0, passRate = 0
        // (recentRuns.length === 0 branch — the `recentRuns.length > 0`
        // guard returns 0 instead of NaN).
        setupFw({
            controlIds: ['c1', 'c2'],
            planControlIds: [],
            runs: [],
        });
        const out = await computeTestReadiness(ctx);
        expect(out[0]).toMatchObject({
            withTestPlan: 0,
            testPlanCoverage: 0,
            withRecentRun: 0,
            testRunCoverage: 0,
            passRate: 0,
            recentRuns: 0,
            recentPasses: 0,
        });
    });

    it('all runs PASS → passRate 100', async () => {
        setupFw({
            controlIds: ['c1'],
            planControlIds: ['c1'],
            runs: [
                { controlId: 'c1', result: 'PASS' },
                { controlId: 'c1', result: 'PASS' },
            ],
        });
        const out = await computeTestReadiness(ctx);
        expect(out[0].passRate).toBe(100);
        expect(out[0].recentPasses).toBe(2);
        expect(out[0].recentRuns).toBe(2);
    });

    it('no PASS results → passRate 0 (the PASS filter branch)', async () => {
        setupFw({
            controlIds: ['c1'],
            planControlIds: ['c1'],
            runs: [
                { controlId: 'c1', result: 'FAIL' },
                { controlId: 'c1', result: 'INCONCLUSIVE' },
            ],
        });
        const out = await computeTestReadiness(ctx);
        expect(out[0].passRate).toBe(0);
        expect(out[0].recentPasses).toBe(0);
        expect(out[0].recentRuns).toBe(2);
    });

    it('dedupes control IDs across multiple mapped requirements', async () => {
        // The same control mapped to two requirements should NOT
        // count twice in totalMappedControls.
        tenantDb.framework.findMany.mockResolvedValue([
            { id: 'fw-1', key: 'iso', name: 'ISO 27001' },
        ]);
        tenantDb.controlRequirementLink.findMany.mockResolvedValue([
            { controlId: 'c1' },
            { controlId: 'c1' },
            { controlId: 'c2' },
        ]);
        tenantDb.controlTestPlan.findMany.mockResolvedValue([]);
        tenantDb.controlTestRun.findMany.mockResolvedValue([]);
        const out = await computeTestReadiness(ctx);
        expect(out[0].totalMappedControls).toBe(2);
    });

    it('queries the test-plan table only for ACTIVE plans', async () => {
        setupFw({ controlIds: ['c1'], planControlIds: [], runs: [] });
        await computeTestReadiness(ctx);
        const call = tenantDb.controlTestPlan.findMany.mock.calls[0][0];
        expect(call.where.status).toBe('ACTIVE');
        expect(call.where.tenantId).toBe('tenant-1');
        expect(call.where.controlId).toEqual({ in: ['c1'] });
    });

    it('queries runs only for COMPLETED status in the last 90 days', async () => {
        setupFw({ controlIds: ['c1'], planControlIds: [], runs: [] });
        await computeTestReadiness(ctx);
        const call = tenantDb.controlTestRun.findMany.mock.calls[0][0];
        expect(call.where.status).toBe('COMPLETED');
        expect(call.where.executedAt.gte).toBeInstanceOf(Date);
        // 90-day cutoff — be lenient: within +/- 1 day.
        const cutoff = call.where.executedAt.gte as Date;
        const expected = new Date();
        expected.setDate(expected.getDate() - 90);
        const drift = Math.abs(cutoff.getTime() - expected.getTime());
        expect(drift).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it('handles multiple frameworks, one of which has zero mapped controls', async () => {
        tenantDb.framework.findMany.mockResolvedValue([
            { id: 'fw-1', key: 'iso', name: 'ISO 27001' },
            { id: 'fw-2', key: 'soc2', name: 'SOC 2' },
        ]);
        // fw-1 has c1; fw-2 has nothing.
        tenantDb.controlRequirementLink.findMany
            .mockResolvedValueOnce([{ controlId: 'c1' }])
            .mockResolvedValueOnce([]);
        tenantDb.controlTestPlan.findMany.mockResolvedValue([{ id: 'p1', controlId: 'c1' }]);
        tenantDb.controlTestRun.findMany.mockResolvedValue([]);
        const out = await computeTestReadiness(ctx);
        expect(out.map((r) => r.frameworkKey)).toEqual(['iso']);
        expect(out[0].withTestPlan).toBe(1);
    });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks + fake
 * Prisma tx shims mirror runtime contracts; per-line typing has poor
 * cost/benefit in test files (codebase-standard file-level disable). */
/**
 * feat/audit-cycle-unify — readiness folds REAL open Findings.
 *
 * Pre-this-change `computeReadiness` counted "open issues" only from
 * `Task` rows (type CONTROL_GAP / AUDIT_FINDING). This locks in the new
 * behaviour: an OPEN `Finding` raised on an audit that belongs to the
 * cycle (Audit.auditCycleId = cycleId) now raises the cycle's issue
 * count and therefore lowers readiness.
 *
 * Drives the GENERIC scoring path (custom framework key) with a fake
 * tenant-tx that exposes every method each stage touches, so the test
 * is insensitive to call ordering.
 */
jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(),
}));
jest.mock('../../../src/app-layer/events/audit', () => ({
    logEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/app-layer/policies/audit-readiness.policies', () => ({
    assertCanViewPack: jest.fn(),
}));

import { computeReadiness } from '@/app-layer/usecases/audit-readiness-scoring';
import { runInTenantContext } from '@/lib/db-context';
import { makeRequestContext } from '../../helpers/make-context';

const mockRunInTx = runInTenantContext as jest.MockedFunction<typeof runInTenantContext>;

function fakeTdb(findingCount: number, taskCount: number, frameworkKey = 'CUSTOMX') {
    return {
        auditCycle: {
            findFirst: jest.fn().mockResolvedValue({
                id: 'cyc1',
                tenantId: 't1',
                // CUSTOMX → GENERIC fallback; 'NIS2' → NIS2 profile.
                frameworkKey,
            }),
        },
        tenant: { findUnique: jest.fn().mockResolvedValue({ readinessWeightsJson: null }) },
        framework: { findFirst: jest.fn().mockResolvedValue(null) },
        frameworkRequirement: { findMany: jest.fn().mockResolvedValue([]) },
        controlRequirementLink: { findMany: jest.fn().mockResolvedValue([]) },
        control: { findMany: jest.fn().mockResolvedValue([]) },
        evidence: { findMany: jest.fn().mockResolvedValue([]) },
        policy: { findMany: jest.fn().mockResolvedValue([]) },
        // GENERIC uses task.count; NIS2 uses task.findMany.
        task: { count: jest.fn().mockResolvedValue(taskCount), findMany: jest.fn().mockResolvedValue([]) },
        finding: { count: jest.fn().mockResolvedValue(findingCount) },
        readinessSnapshot: { create: jest.fn().mockResolvedValue({}) },
    };
}

describe('computeReadiness folds open Findings into the issue count', () => {
    it('an open Finding on the cycle raises issues.open and lowers the issue score', async () => {
        const tdb = fakeTdb(/* findings */ 2, /* tasks */ 0);
        mockRunInTx.mockImplementation(async (_ctx: any, fn: any) => fn(tdb));

        const result = await computeReadiness(makeRequestContext('ADMIN'), 'cyc1');

        // 0 task issues + 2 open findings = 2 → issueScore = 100 - 2*5 = 90.
        expect(result.breakdown.issues.open).toBe(2);
        expect(result.breakdown.issues.score).toBe(90);

        // The finding count query targets open findings on the cycle's audits
        // (now via an OR so framework-scoped self-assessment findings can join).
        const whereArg = tdb.finding.count.mock.calls[0][0].where;
        expect(whereArg.status).toEqual({ not: 'CLOSED' });
        expect(whereArg.OR).toContainEqual({ audit: { auditCycleId: 'cyc1' } });
        // A non-NIS2 cycle does NOT broaden to sourceKind matching.
        expect(whereArg.OR).not.toContainEqual(
            expect.objectContaining({ sourceKind: 'NIS2_SELF_ASSESSMENT' }),
        );
    });

    it('zero findings leaves the issue score at 100 (no penalty)', async () => {
        const tdb = fakeTdb(0, 0);
        mockRunInTx.mockImplementation(async (_ctx: any, fn: any) => fn(tdb));

        const result = await computeReadiness(makeRequestContext('ADMIN'), 'cyc1');

        expect(result.breakdown.issues.open).toBe(0);
        expect(result.breakdown.issues.score).toBe(100);
    });

    it('a NIS2 cycle also counts NIS2 self-assessment findings (auditId null)', async () => {
        // feat/audit-cycle-unify — NIS2 gap-findings are materialised with no
        // fieldwork audit, so the count query must OR in a sourceKind match for
        // the NIS2 cycle. This is the NIS2-finding → readiness path.
        const tdb = fakeTdb(/* findings */ 1, /* tasks */ 0, 'NIS2');
        mockRunInTx.mockImplementation(async (_ctx: any, fn: any) => fn(tdb));

        const result = await computeReadiness(makeRequestContext('ADMIN'), 'cyc1');

        const whereArg = tdb.finding.count.mock.calls[0][0].where;
        expect(whereArg.OR).toContainEqual({ audit: { auditCycleId: 'cyc1' } });
        expect(whereArg.OR).toContainEqual({ auditId: null, sourceKind: 'NIS2_SELF_ASSESSMENT' });
        // The single open finding is folded into the NIS2 issue count.
        expect(result.breakdown.issues.open).toBe(1);
    });
});

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

function fakeTdb(findingCount: number, taskCount: number) {
    return {
        auditCycle: {
            findFirst: jest.fn().mockResolvedValue({
                id: 'cyc1',
                tenantId: 't1',
                // Custom key → GENERIC fallback (coverage/evidence/issues).
                frameworkKey: 'CUSTOMX',
            }),
        },
        tenant: { findUnique: jest.fn().mockResolvedValue({ readinessWeightsJson: null }) },
        framework: { findFirst: jest.fn().mockResolvedValue(null) },
        frameworkRequirement: { findMany: jest.fn().mockResolvedValue([]) },
        controlRequirementLink: { findMany: jest.fn().mockResolvedValue([]) },
        control: { findMany: jest.fn().mockResolvedValue([]) },
        evidence: { findMany: jest.fn().mockResolvedValue([]) },
        task: { count: jest.fn().mockResolvedValue(taskCount) },
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

        // The finding count query targets open findings on the cycle's audits.
        const whereArg = tdb.finding.count.mock.calls[0][0].where;
        expect(whereArg.status).toEqual({ not: 'CLOSED' });
        expect(whereArg.audit).toEqual({ auditCycleId: 'cyc1' });
    });

    it('zero findings leaves the issue score at 100 (no penalty)', async () => {
        const tdb = fakeTdb(0, 0);
        mockRunInTx.mockImplementation(async (_ctx: any, fn: any) => fn(tdb));

        const result = await computeReadiness(makeRequestContext('ADMIN'), 'cyc1');

        expect(result.breakdown.issues.open).toBe(0);
        expect(result.breakdown.issues.score).toBe(100);
    });
});

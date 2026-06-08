/* eslint-disable @typescript-eslint/no-explicit-any -- standard test-mock pattern. */

/**
 * VR-7 — sub-flow dispatch job: resolve a group's entry rule and run it as a
 * child execution linked to the invoking execution.
 */
jest.mock('@/lib/prisma', () => ({
    prisma: {
        automationRule: { findFirst: jest.fn(), updateMany: jest.fn() },
        automationExecution: { create: jest.fn() },
    },
}));
jest.mock('@/lib/observability/job-runner', () => ({
    runJob: jest.fn(async (_n: string, fn: () => any) => fn()),
}));

import { runSubflowDispatch } from '@/app-layer/jobs/subflow-dispatcher';
import { prisma } from '@/lib/prisma';

const mockPrisma = prisma as any;

const payload = {
    tenantId: 't1',
    targetGroupId: 'group-1',
    parentExecutionId: 'exec-parent',
    triggerEvent: 'RISK_CREATED',
    data: {},
};

beforeEach(() => jest.clearAllMocks());

describe('runSubflowDispatch', () => {
    it('dispatches the group entry rule as a linked child execution', async () => {
        mockPrisma.automationRule.findFirst.mockResolvedValue({ id: 'entry-rule', actionType: 'NOTIFY_USER' });
        mockPrisma.automationExecution.create.mockResolvedValue({ id: 'child-exec' });

        const { result, executionId } = await runSubflowDispatch(payload);

        expect(executionId).toBe('child-exec');
        expect(result.success).toBe(true);
        // entry-rule lookup is scoped to the target group + tenant + ENABLED
        const where = mockPrisma.automationRule.findFirst.mock.calls[0][0].where;
        expect(where).toMatchObject({ tenantId: 't1', subFlowGroupId: 'group-1', status: 'ENABLED' });
        // child execution carries the parent lineage + subflow trigger source
        const created = mockPrisma.automationExecution.create.mock.calls[0][0].data;
        expect(created.parentExecutionId).toBe('exec-parent');
        expect(created.triggeredBy).toBe('subflow');
        expect(created.ruleId).toBe('entry-rule');
    });

    it('skips cleanly when the group has no enabled entry rule', async () => {
        mockPrisma.automationRule.findFirst.mockResolvedValue(null);
        const { result, executionId } = await runSubflowDispatch(payload);
        expect(executionId).toBeNull();
        expect(result.success).toBe(true);
        expect(mockPrisma.automationExecution.create).not.toHaveBeenCalled();
    });
});

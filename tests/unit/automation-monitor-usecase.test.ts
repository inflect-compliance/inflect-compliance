/* eslint-disable @typescript-eslint/no-explicit-any -- standard test-mock pattern. */

/**
 * Unit tests for the live-monitor usecases (Automation Epic 10):
 * listLiveExecutions, cancelExecution, dryRunRule.
 */

const mockDb = {
    automationExecution: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

jest.mock('@/app-layer/automation', () => ({
    AutomationRuleRepository: { getById: jest.fn() },
    AutomationExecutionRepository: {
        getById: jest.fn(),
        recordCompletion: jest.fn(),
        listForRule: jest.fn(),
        listForRulePaginated: jest.fn(),
    },
    assertCanReadAutomationHistory: (ctx: any) => {
        if (!ctx.permissions.canRead && !ctx.permissions.canAudit) throw new Error('forbidden:history');
    },
    assertCanExecuteAutomation: (ctx: any) => {
        if (!ctx.permissions.canWrite) throw new Error('forbidden:execute');
    },
    matchesFilter: jest.fn(),
}));

jest.mock('@/app-layer/jobs/queue', () => ({ enqueue: jest.fn() }));

import {
    listLiveExecutions,
    cancelExecution,
    dryRunRule,
} from '@/app-layer/usecases/automation-executions';
import {
    AutomationRuleRepository,
    AutomationExecutionRepository,
    matchesFilter,
} from '@/app-layer/automation';
import { makeRequestContext } from '../helpers/make-context';

const ruleRepo = AutomationRuleRepository as jest.Mocked<typeof AutomationRuleRepository>;
const execRepo = AutomationExecutionRepository as jest.Mocked<typeof AutomationExecutionRepository>;
const matches = matchesFilter as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('listLiveExecutions', () => {
    it('returns shaped running + recent feeds', async () => {
        mockDb.automationExecution.findMany
            .mockResolvedValueOnce([
                { id: 'e1', ruleId: 'r1', triggerEvent: 'RISK_CREATED', status: 'RUNNING', triggeredBy: 'event', createdAt: new Date(), rule: { name: 'R1' } },
            ])
            .mockResolvedValueOnce([
                { id: 'e1', ruleId: 'r1', triggerEvent: 'RISK_CREATED', status: 'RUNNING', triggeredBy: 'event', createdAt: new Date(), rule: { name: 'R1' } },
            ]);
        const ctx = makeRequestContext('ADMIN');
        const out = await listLiveExecutions(ctx);
        expect(out.running).toHaveLength(1);
        expect(out.running[0].ruleName).toBe('R1');
        expect(out.recent).toHaveLength(1);
    });
});

describe('cancelExecution', () => {
    it('marks an in-flight execution SKIPPED', async () => {
        execRepo.getById.mockResolvedValue({ id: 'e1', status: 'RUNNING' } as any);
        const ctx = makeRequestContext('EDITOR');
        await cancelExecution(ctx, 'e1');
        expect(execRepo.recordCompletion).toHaveBeenCalledWith(
            mockDb,
            expect.anything(),
            'e1',
            expect.objectContaining({ status: 'SKIPPED' }),
        );
    });

    it('refuses to cancel a finished execution', async () => {
        execRepo.getById.mockResolvedValue({ id: 'e1', status: 'SUCCEEDED' } as any);
        const ctx = makeRequestContext('EDITOR');
        await expect(cancelExecution(ctx, 'e1')).rejects.toThrow(/in-flight/i);
        expect(execRepo.recordCompletion).not.toHaveBeenCalled();
    });
});

describe('dryRunRule', () => {
    it('evaluates the filter without creating an execution', async () => {
        ruleRepo.getById.mockResolvedValue({ id: 'r1', triggerEvent: 'RISK_CREATED', triggerFilterJson: null } as any);
        execRepo.listForRule.mockResolvedValue([{ triggerPayloadJson: { severity: 'HIGH' } }] as any);
        matches.mockReturnValue(true);
        const ctx = makeRequestContext('EDITOR');
        const out = await dryRunRule(ctx, 'r1');
        expect(out.matches).toBe(true);
        expect(out.triggerEvent).toBe('RISK_CREATED');
        expect(matches).toHaveBeenCalled();
    });
});

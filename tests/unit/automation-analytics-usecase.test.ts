/* eslint-disable @typescript-eslint/no-explicit-any -- standard test-mock pattern. */

/**
 * Unit tests for getAutomationAnalytics (Automation Epic 9) — aggregation
 * correctness over a mixed success/failure execution set.
 */

const mockDb = {
    automationRule: { count: jest.fn(), findMany: jest.fn() },
    automationExecution: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));
jest.mock('@/app-layer/automation', () => ({
    assertCanReadAutomation: (ctx: any) => {
        if (!ctx.permissions.canRead) throw new Error('forbidden:read');
    },
}));

import { getAutomationAnalytics } from '@/app-layer/usecases/automation-analytics';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => jest.clearAllMocks());

describe('getAutomationAnalytics', () => {
    it('aggregates counts, daily buckets, top rules, breaches, error rate', async () => {
        mockDb.automationRule.count
            .mockResolvedValueOnce(5) // totalRules
            .mockResolvedValueOnce(3); // enabledRules
        mockDb.automationRule.findMany.mockResolvedValue([
            { id: 'r1', name: 'Rule One' },
            { id: 'r2', name: 'Rule Two' },
        ]);
        mockDb.automationExecution.findMany.mockResolvedValue([
            { ruleId: 'r1', status: 'SUCCEEDED', durationMs: 100, errorMessage: null, createdAt: new Date('2026-06-01T10:00:00Z') },
            { ruleId: 'r1', status: 'FAILED', durationMs: 200, errorMessage: 'SLA window of 60m breached', createdAt: new Date('2026-06-01T11:00:00Z') },
            { ruleId: 'r2', status: 'SUCCEEDED', durationMs: 300, errorMessage: null, createdAt: new Date('2026-06-02T09:00:00Z') },
        ]);

        const ctx = makeRequestContext('ADMIN');
        const out = await getAutomationAnalytics(ctx, 30);

        expect(out.totalRules).toBe(5);
        expect(out.enabledRules).toBe(3);
        expect(out.totalExecutions).toBe(3);
        // 2 distinct days
        expect(out.executions).toHaveLength(2);
        expect(out.executions[0].date).toBe('2026-06-01');
        expect(out.executions[0].succeeded + out.executions[0].failed).toBe(2);
        // top rules: r1 has 2 (1 ok), r2 has 1 (1 ok)
        expect(out.topRules[0].ruleId).toBe('r1');
        expect(out.topRules[0].count).toBe(2);
        expect(out.topRules[0].successRate).toBe(50);
        // 1 SLA breach (errorMessage contains 'SLA window')
        expect(out.slaBreaches).toBe(1);
        // avg duration (100+200+300)/3 = 200
        expect(out.avgDurationMs).toBe(200);
        // error rate 1/3 → 33%
        expect(out.errorRate).toBe(33);
    });

    it('rejects a caller without read', async () => {
        const ctx = makeRequestContext('READER', { permissions: { canRead: false } as any });
        await expect(getAutomationAnalytics(ctx)).rejects.toThrow('forbidden:read');
    });
});

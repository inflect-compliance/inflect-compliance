/* eslint-disable @typescript-eslint/no-explicit-any -- standard test-mock pattern. */

/**
 * Unit tests for `src/app-layer/usecases/automation-rules.ts`
 * (Workflow Automation Epic 1).
 *
 * Covers the RBAC gate (read vs manage), tenant-context delegation to the
 * repository, free-text sanitisation, audit emission on mutation, and the
 * notFound paths.
 */

const mockDb = { __db: true } as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

jest.mock('@/app-layer/automation', () => ({
    AutomationRuleRepository: {
        list: jest.fn(),
        getById: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        archive: jest.fn(),
        toggle: jest.fn(),
    },
    assertCanReadAutomation: (ctx: any) => {
        if (!ctx.permissions.canRead) throw new Error('forbidden:read');
    },
    assertCanManageAutomation: (ctx: any) => {
        if (!ctx.permissions.canAdmin) throw new Error('forbidden:manage');
    },
}));

jest.mock('@/app-layer/events/audit', () => ({ logEvent: jest.fn() }));

jest.mock('@/lib/security/sanitize', () => ({
    sanitizePlainText: jest.fn((s: string) => `SAN::${s}`),
}));

import {
    listAutomationRules,
    getAutomationRule,
    createAutomationRule,
    updateAutomationRule,
    archiveAutomationRule,
    toggleAutomationRule,
} from '@/app-layer/usecases/automation-rules';
import { AutomationRuleRepository } from '@/app-layer/automation';
import { logEvent } from '@/app-layer/events/audit';
import { makeRequestContext } from '../helpers/make-context';

const repo = AutomationRuleRepository as jest.Mocked<typeof AutomationRuleRepository>;

beforeEach(() => jest.clearAllMocks());

const baseInput = {
    name: 'My rule',
    triggerEvent: 'RISK_CREATED',
    actionType: 'NOTIFY_USER' as const,
    actionConfig: { userIds: ['u1'], message: 'hi' },
};

describe('automation-rules usecase — RBAC', () => {
    it('listAutomationRules rejects a caller without read', async () => {
        const ctx = makeRequestContext('READER', {
            permissions: { canRead: false } as any,
        });
        await expect(listAutomationRules(ctx)).rejects.toThrow('forbidden:read');
        expect(repo.list).not.toHaveBeenCalled();
    });

    it('createAutomationRule rejects a non-admin (EDITOR)', async () => {
        const ctx = makeRequestContext('EDITOR');
        await expect(createAutomationRule(ctx, baseInput as any)).rejects.toThrow(
            'forbidden:manage',
        );
        expect(repo.create).not.toHaveBeenCalled();
    });
});

describe('automation-rules usecase — delegation + audit', () => {
    it('listAutomationRules delegates to the repo with filters', async () => {
        repo.list.mockResolvedValue([{ id: 'r1' }] as any);
        const ctx = makeRequestContext('ADMIN');
        const out = await listAutomationRules(ctx, { status: 'ENABLED' } as any);
        expect(repo.list).toHaveBeenCalledWith(mockDb, ctx, { status: 'ENABLED' });
        expect(out).toEqual([{ id: 'r1' }]);
    });

    it('createAutomationRule sanitises name + description and audits', async () => {
        repo.create.mockResolvedValue({
            id: 'r2',
            name: 'SAN::My rule',
            triggerEvent: 'RISK_CREATED',
            actionType: 'NOTIFY_USER',
            status: 'DRAFT',
        } as any);
        const ctx = makeRequestContext('ADMIN');
        await createAutomationRule(ctx, { ...baseInput, description: 'desc' } as any);
        // name + description routed through the sanitiser
        expect(repo.create).toHaveBeenCalledWith(
            mockDb,
            ctx,
            expect.objectContaining({ name: 'SAN::My rule', description: 'SAN::desc' }),
        );
        expect(logEvent).toHaveBeenCalledWith(
            mockDb,
            ctx,
            expect.objectContaining({
                action: 'AUTOMATION_RULE_CREATED',
                entityType: 'AutomationRule',
                entityId: 'r2',
            }),
        );
    });

    it('updateAutomationRule rejects a chain that loops back (cycle guard)', async () => {
        repo.getById.mockImplementation((_db: any, _ctx: any, id: string) =>
            Promise.resolve(id === 'r2' ? ({ id: 'r2', nextRuleId: 'r1' } as any) : null),
        );
        const ctx = makeRequestContext('ADMIN');
        await expect(
            updateAutomationRule(ctx, 'r1', { nextRuleId: 'r2' }),
        ).rejects.toThrow(/cycle/i);
        expect(repo.update).not.toHaveBeenCalled();
    });

    it('updateAutomationRule throws notFound when the rule is missing', async () => {
        repo.update.mockResolvedValue(null as any);
        const ctx = makeRequestContext('ADMIN');
        await expect(
            updateAutomationRule(ctx, 'missing', { priority: 5 }),
        ).rejects.toThrow(/not found/i);
        expect(logEvent).not.toHaveBeenCalled();
    });

    it('getAutomationRule throws notFound when absent', async () => {
        repo.getById.mockResolvedValue(null as any);
        const ctx = makeRequestContext('ADMIN');
        await expect(getAutomationRule(ctx, 'nope')).rejects.toThrow(/not found/i);
    });

    it('toggleAutomationRule enables a rule and audits ENABLED', async () => {
        repo.toggle.mockResolvedValue({ id: 'r4', name: 'Tog', status: 'ENABLED' } as any);
        const ctx = makeRequestContext('ADMIN');
        await toggleAutomationRule(ctx, 'r4', 'ENABLED');
        expect(repo.toggle).toHaveBeenCalledWith(mockDb, ctx, 'r4', 'ENABLED');
        expect(logEvent).toHaveBeenCalledWith(
            mockDb,
            ctx,
            expect.objectContaining({ action: 'AUTOMATION_RULE_ENABLED', entityId: 'r4' }),
        );
    });

    it('toggleAutomationRule throws notFound when the rule is archived/missing', async () => {
        repo.toggle.mockResolvedValue(null as any);
        const ctx = makeRequestContext('ADMIN');
        await expect(toggleAutomationRule(ctx, 'gone', 'DISABLED')).rejects.toThrow(
            /not found|archived/i,
        );
        expect(logEvent).not.toHaveBeenCalled();
    });

    it('toggleAutomationRule rejects a non-admin', async () => {
        const ctx = makeRequestContext('EDITOR');
        await expect(toggleAutomationRule(ctx, 'r4', 'ENABLED')).rejects.toThrow(
            'forbidden:manage',
        );
        expect(repo.toggle).not.toHaveBeenCalled();
    });

    it('archiveAutomationRule audits and returns the archived rule', async () => {
        repo.getById.mockResolvedValue({ id: 'r3', name: 'Old' } as any);
        repo.archive.mockResolvedValue({ id: 'r3', deletedAt: new Date() } as any);
        const ctx = makeRequestContext('ADMIN');
        await archiveAutomationRule(ctx, 'r3');
        expect(repo.archive).toHaveBeenCalledWith(mockDb, ctx, 'r3');
        expect(logEvent).toHaveBeenCalledWith(
            mockDb,
            ctx,
            expect.objectContaining({ action: 'AUTOMATION_RULE_ARCHIVED', entityId: 'r3' }),
        );
    });
});

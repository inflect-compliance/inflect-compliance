/* eslint-disable @typescript-eslint/no-explicit-any -- standard test-mock pattern. */

/**
 * Unit tests for src/app-layer/usecases/automation-templates.ts (Epic 8).
 *
 * Covers the read gate on listing, and import-as-DRAFT (manage gate +
 * notFound + delegation to createAutomationRule).
 */

jest.mock('@/app-layer/automation', () => ({
    assertCanReadAutomation: (ctx: any) => {
        if (!ctx.permissions.canRead) throw new Error('forbidden:read');
    },
    assertCanManageAutomation: (ctx: any) => {
        if (!ctx.permissions.canAdmin) throw new Error('forbidden:manage');
    },
}));

jest.mock('@/app-layer/usecases/automation-rules', () => ({
    createAutomationRule: jest.fn(),
}));

import {
    listAutomationTemplates,
    createRuleFromTemplate,
} from '@/app-layer/usecases/automation-templates';
import { createAutomationRule } from '@/app-layer/usecases/automation-rules';
import { AUTOMATION_TEMPLATES } from '@/data/automation-templates';
import { makeRequestContext } from '../helpers/make-context';

const createMock = createAutomationRule as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('listAutomationTemplates', () => {
    it('returns the catalog for a reader', () => {
        const ctx = makeRequestContext('READER');
        expect(listAutomationTemplates(ctx)).toBe(AUTOMATION_TEMPLATES);
    });

    it('rejects a caller without read', () => {
        const ctx = makeRequestContext('READER', { permissions: { canRead: false } as any });
        expect(() => listAutomationTemplates(ctx)).toThrow('forbidden:read');
    });
});

describe('createRuleFromTemplate', () => {
    it('imports a known template as a DRAFT rule', async () => {
        createMock.mockResolvedValue({ id: 'r1', status: 'DRAFT' });
        const ctx = makeRequestContext('ADMIN');
        const tpl = AUTOMATION_TEMPLATES[0];
        await createRuleFromTemplate(ctx, tpl.id);
        expect(createMock).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                name: tpl.name,
                triggerEvent: tpl.trigger,
                actionType: tpl.actionType,
                status: 'DRAFT',
            }),
        );
    });

    it('throws notFound for an unknown template', async () => {
        const ctx = makeRequestContext('ADMIN');
        await expect(createRuleFromTemplate(ctx, 'nope')).rejects.toThrow(/not found/i);
        expect(createMock).not.toHaveBeenCalled();
    });

    it('rejects a non-admin before doing anything', async () => {
        const ctx = makeRequestContext('EDITOR');
        await expect(
            createRuleFromTemplate(ctx, AUTOMATION_TEMPLATES[0].id),
        ).rejects.toThrow('forbidden:manage');
    });
});

/**
 * Automation rule usecases (Workflow Automation Epic 1).
 *
 * Thin orchestration over `AutomationRuleRepository`: assert the
 * automation-domain policy, run inside the tenant RLS context, call the
 * repo, emit an audit event on mutation. The HTTP routes under
 * `/api/t/[slug]/automation/rules` call these — never the repo directly.
 *
 * RBAC uses the automation module's own policies (`assertCanReadAutomation`
 * / `assertCanManageAutomation`) rather than new `PermissionSet` keys: the
 * domain already ships dedicated RBAC (read = any member, manage = ADMIN),
 * and `/automation/` is not a `PRIVILEGED_ROOTS` entry in the
 * api-permission-coverage guard, so the usecase-policy pattern is correct
 * here (same as controls/risks/evidence).
 */
import { RequestContext } from '../types';
import {
    AutomationRuleRepository,
    assertCanReadAutomation,
    assertCanManageAutomation,
    type AutomationRuleListFilters,
    type CreateAutomationRuleInput,
    type UpdateAutomationRuleInput,
} from '../automation';
import { logEvent } from '../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import { sanitizePlainText } from '@/lib/security/sanitize';

/** Optional free-text fields are sanitised before persistence. */
function sanitizeOptional(value: string | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return sanitizePlainText(value);
}

export async function listAutomationRules(
    ctx: RequestContext,
    filters: AutomationRuleListFilters = {},
) {
    assertCanReadAutomation(ctx);
    return runInTenantContext(ctx, (db) =>
        AutomationRuleRepository.list(db, ctx, filters),
    );
}

export async function getAutomationRule(ctx: RequestContext, id: string) {
    assertCanReadAutomation(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rule = await AutomationRuleRepository.getById(db, ctx, id);
        if (!rule) throw notFound('Automation rule not found');
        return rule;
    });
}

export async function createAutomationRule(
    ctx: RequestContext,
    input: CreateAutomationRuleInput,
) {
    assertCanManageAutomation(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rule = await AutomationRuleRepository.create(db, ctx, {
            ...input,
            name: sanitizePlainText(input.name),
            description: sanitizeOptional(input.description),
        });
        await logEvent(db, ctx, {
            action: 'AUTOMATION_RULE_CREATED',
            entityType: 'AutomationRule',
            entityId: rule.id,
            detailsJson: {
                name: rule.name,
                triggerEvent: rule.triggerEvent,
                actionType: rule.actionType,
                status: rule.status,
            },
        });
        return rule;
    });
}

export async function updateAutomationRule(
    ctx: RequestContext,
    id: string,
    input: UpdateAutomationRuleInput,
) {
    assertCanManageAutomation(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rule = await AutomationRuleRepository.update(db, ctx, id, {
            ...input,
            ...(input.name !== undefined ? { name: sanitizePlainText(input.name) } : {}),
            ...(input.description !== undefined
                ? { description: sanitizeOptional(input.description) }
                : {}),
        });
        if (!rule) throw notFound('Automation rule not found');
        await logEvent(db, ctx, {
            action: 'AUTOMATION_RULE_UPDATED',
            entityType: 'AutomationRule',
            entityId: rule.id,
            detailsJson: { name: rule.name, status: rule.status },
        });
        return rule;
    });
}

export async function toggleAutomationRule(
    ctx: RequestContext,
    id: string,
    status: 'ENABLED' | 'DISABLED',
) {
    assertCanManageAutomation(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rule = await AutomationRuleRepository.toggle(db, ctx, id, status);
        if (!rule) {
            throw notFound('Automation rule not found, or it has been archived');
        }
        await logEvent(db, ctx, {
            action: status === 'ENABLED' ? 'AUTOMATION_RULE_ENABLED' : 'AUTOMATION_RULE_DISABLED',
            entityType: 'AutomationRule',
            entityId: rule.id,
            detailsJson: { name: rule.name, status },
        });
        return rule;
    });
}

export async function archiveAutomationRule(ctx: RequestContext, id: string) {
    assertCanManageAutomation(ctx);
    return runInTenantContext(ctx, async (db) => {
        const existing = await AutomationRuleRepository.getById(db, ctx, id);
        if (!existing) throw notFound('Automation rule not found');
        const rule = await AutomationRuleRepository.archive(db, ctx, id);
        await logEvent(db, ctx, {
            action: 'AUTOMATION_RULE_ARCHIVED',
            entityType: 'AutomationRule',
            entityId: id,
            detailsJson: { name: existing.name },
        });
        return rule;
    });
}

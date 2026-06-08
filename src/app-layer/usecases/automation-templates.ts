/**
 * Automation template usecases (Workflow Automation Epic 8).
 *
 * Templates are static, trusted content (no DB) — list them for the picker,
 * and import one as a DRAFT rule the tenant can customise before enabling.
 */
import { RequestContext } from '../types';
import { assertCanReadAutomation, assertCanManageAutomation } from '../automation';
import { AUTOMATION_TEMPLATES, getTemplateById } from '@/data/automation-templates';
import { createAutomationRule } from './automation-rules';
import { notFound } from '@/lib/errors/types';

export function listAutomationTemplates(ctx: RequestContext) {
    assertCanReadAutomation(ctx);
    return AUTOMATION_TEMPLATES;
}

/**
 * Import a template as a DRAFT rule. Reuses `createAutomationRule` so the
 * usual policy + audit + tenant-context path runs. Created DRAFT so the user
 * reviews + enables explicitly.
 */
export async function createRuleFromTemplate(ctx: RequestContext, templateId: string) {
    assertCanManageAutomation(ctx);
    const tpl = getTemplateById(templateId);
    if (!tpl) throw notFound('Template not found');
    return createAutomationRule(ctx, {
        name: tpl.name,
        description: tpl.description,
        triggerEvent: tpl.trigger,
        triggerFilter: tpl.filter as never,
        actionType: tpl.actionType,
        actionConfig: tpl.actionConfig as never,
        status: 'DRAFT',
    });
}

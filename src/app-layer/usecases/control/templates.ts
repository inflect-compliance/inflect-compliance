import { RequestContext } from '../../types';
import { ControlTemplateRepository } from '../../repositories/ControlTemplateRepository';
import { ControlRepository } from '../../repositories/ControlRepository';
import { FrameworkRepository } from '../../repositories/FrameworkRepository';
import {
    assertCanReadControls, assertCanCreateControl, assertCanMapFramework,
} from '../../policies/control.policies';
import { logEvent } from '../../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';

// ─── Templates ───

export async function listControlTemplates(ctx: RequestContext) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, (db) =>
        ControlTemplateRepository.list(db)
    );
}

export async function installControlsFromTemplate(ctx: RequestContext, templateIds: string[]) {
    assertCanCreateControl(ctx);

    return runInTenantContext(ctx, async (db) => {
        const results: Array<{ templateCode: string; controlId: string; tasksCreated: number; requirementsLinked: number }> = [];

        for (const templateId of templateIds) {
            const template = await ControlTemplateRepository.getById(db, templateId);
            if (!template) continue;

            // Check if control with this code already exists for tenant
            const existing = await db.control.findFirst({
                where: { tenantId: ctx.tenantId, code: template.code },
            });
            if (existing) {
                // Skip — idempotent, don't create duplicates
                results.push({
                    templateCode: template.code,
                    controlId: existing.id,
                    tasksCreated: 0,
                    requirementsLinked: 0,
                });
                continue;
            }

            // Create control from template
            const control = await db.control.create({
                data: {
                    tenantId: ctx.tenantId,
                    code: template.code,
                    name: template.title,
                    category: template.category,
                    frequency: template.defaultFrequency,
                    status: 'NOT_STARTED',
                    isCustom: false,
                    createdByUserId: ctx.userId,
                },
            });

            // Create tasks from template
            let tasksCreated = 0;
            for (const tplTask of template.tasks) {
                await db.controlTask.create({
                    data: {
                        tenantId: ctx.tenantId,
                        controlId: control.id,
                        title: tplTask.title,
                        description: tplTask.description,
                    },
                });
                tasksCreated++;
            }

            // Create framework mapping links
            let requirementsLinked = 0;
            for (const rl of template.requirementLinks) {
                await db.frameworkMapping.create({
                    data: {
                        fromRequirementId: rl.requirementId,
                        toControlId: control.id,
                    },
                });
                requirementsLinked++;
            }

            await logEvent(db, ctx, {
                action: 'CONTROL_INSTALLED_FROM_TEMPLATE',
                entityType: 'Control',
                entityId: control.id,
                details: `Installed control from template: ${template.code} — ${template.title}`,
                detailsJson: { category: 'entity_lifecycle', entityName: 'Control', operation: 'created', after: { code: template.code, name: template.title, templateId, tasksCreated, requirementsLinked }, summary: `Installed from template: ${template.code}` },
                metadata: { templateId, tasksCreated, requirementsLinked },
            });

            results.push({
                templateCode: template.code,
                controlId: control.id,
                tasksCreated,
                requirementsLinked,
            });
        }

        return results;
    });
}

// ─── Frameworks (read-only) ───

export async function listFrameworks(ctx: RequestContext) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, (db) =>
        FrameworkRepository.listFrameworks(db)
    );
}

export async function listFrameworkRequirements(ctx: RequestContext, frameworkKey: string) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await FrameworkRepository.listRequirements(db, frameworkKey);
        if (result === null) throw notFound('Framework not found');
        return result;
    });
}

// ─── Requirement Mapping ───

export async function mapRequirementToControl(ctx: RequestContext, controlId: string, requirementId: string) {
    assertCanMapFramework(ctx);
    return runInTenantContext(ctx, async (db) => {
        const control = await db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId } });
        if (!control) throw notFound('Control not found');

        const mapping = await db.frameworkMapping.create({
            data: { fromRequirementId: requirementId, toControlId: controlId },
            include: { fromRequirement: { include: { framework: { select: { name: true } } } } },
        });
        return mapping;
    });
}

export async function unmapRequirementFromControl(ctx: RequestContext, controlId: string, requirementId: string) {
    assertCanMapFramework(ctx);
    return runInTenantContext(ctx, async (db) => {
        const control = await db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId } });
        if (!control) throw notFound('Control not found');

        const mapping = await db.frameworkMapping.findFirst({
            where: { fromRequirementId: requirementId, toControlId: controlId },
        });
        if (!mapping) throw notFound('Mapping not found');

        await db.frameworkMapping.delete({ where: { id: mapping.id } });
        return { success: true };
    });
}

/**
 * Framework mappings for one control (#102 item 1 — tab-lazy).
 *
 * The Mappings tab fetches this on demand instead of reading the
 * eager `frameworkMappings` array that `getById` used to carry. The
 * payload shape matches what the page already renders.
 */
export async function listControlMappings(ctx: RequestContext, controlId: string) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, async (db) => {
        const control = await db.control.findFirst({
            where: { id: controlId, tenantId: ctx.tenantId },
        });
        if (!control) throw notFound('Control not found');
        return ControlRepository.listFrameworkMappings(db, ctx, controlId);
    });
}

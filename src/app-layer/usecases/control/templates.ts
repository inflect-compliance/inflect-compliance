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
        // `skipped` distinguishes a template whose control already existed
        // (idempotent no-op) from one actually installed — so the "Installed N"
        // toast counts only real installs, not skipped existing controls.
        const results: Array<{ templateCode: string; controlId: string; tasksCreated: number; requirementsLinked: number; skipped: boolean }> = [];

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
                    skipped: true,
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

            // Create unified Task rows (NOT legacy controlTask) so template
            // controls show real task counts in the list and roll up into
            // readiness — matching the framework install wizard.
            let tasksCreated = 0;
            for (const tplTask of template.tasks) {
                await db.task.create({
                    data: {
                        tenantId: ctx.tenantId,
                        controlId: control.id,
                        title: tplTask.title,
                        description: tplTask.description,
                        status: 'OPEN',
                        type: 'TASK',
                        createdByUserId: ctx.userId,
                        assigneeUserId: ctx.userId,
                    },
                });
                tasksCreated++;
            }

            // Create control↔requirement links in the CANONICAL table
            // (controlRequirementLink) — the one SoA, per-framework coverage,
            // readiness and every posture surface read. The framework install
            // wizard writes the same table; template-installed controls now
            // count toward posture instead of rendering as unmapped.
            let requirementsLinked = 0;
            for (const rl of template.requirementLinks) {
                await db.controlRequirementLink.upsert({
                    where: {
                        controlId_requirementId: {
                            controlId: control.id,
                            requirementId: rl.requirementId,
                        },
                    },
                    create: {
                        tenantId: ctx.tenantId,
                        controlId: control.id,
                        requirementId: rl.requirementId,
                    },
                    update: {},
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
                skipped: false,
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

        // Canonical control↔requirement table — the same one SoA / coverage /
        // readiness read. Upsert keeps the action idempotent (re-mapping an
        // existing link is a no-op rather than a unique-constraint error).
        const link = await db.controlRequirementLink.upsert({
            where: {
                controlId_requirementId: { controlId, requirementId },
            },
            create: { tenantId: ctx.tenantId, controlId, requirementId },
            update: {},
            include: { requirement: { include: { framework: { select: { name: true } } } } },
        });
        return link;
    });
}

export async function unmapRequirementFromControl(ctx: RequestContext, controlId: string, requirementId: string) {
    assertCanMapFramework(ctx);
    return runInTenantContext(ctx, async (db) => {
        const control = await db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId } });
        if (!control) throw notFound('Control not found');

        const link = await db.controlRequirementLink.findFirst({
            where: { tenantId: ctx.tenantId, controlId, requirementId },
        });
        if (!link) throw notFound('Mapping not found');

        await db.controlRequirementLink.delete({ where: { id: link.id } });
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
        return ControlRepository.listControlRequirementLinks(db, ctx, controlId);
    });
}

import { RequestContext } from '../types';
import { AuditRepository } from '../repositories/AuditRepository';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import { sanitizePlainText } from '@/lib/security/sanitize';
import type { AuditStatus } from '@prisma/client';
import { z } from 'zod';
import { UpdateAuditSchema } from '@/lib/schemas';

// Epic D.2 — preserve the three-state contract on update paths.
function sanitizeOptional(v: string | null | undefined): string | null | undefined {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return sanitizePlainText(v);
}

export async function listAudits(
    ctx: RequestContext,
    options: { take?: number } = {},
) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        AuditRepository.list(db, ctx, options)
    );
}

export async function getAudit(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const audit = await AuditRepository.getById(db, ctx, id);
        if (!audit) throw notFound('Audit not found');
        return audit;
    });
}

export async function createAudit(ctx: RequestContext, data: {
    title: string;
    scope?: string | null;
    criteria?: string | null;
    schedule?: string | null;
    auditors?: string | null;
    auditees?: string | null;
    departments?: string | null;
    /** B8 — optional `Framework.key` the audit assesses. Nullable for
     *  ad-hoc audits that span multiple frameworks. */
    frameworkKey?: string | null;
    generateChecklist?: boolean;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const audit = await AuditRepository.create(db, ctx, {
            // Epic D.2 — sanitise free-text before persistence.
            // `auditScope`, `criteria`, `auditors`, `auditees`,
            // `departments` are all encrypted in the manifest and
            // also surface in audit-log details + PDF exports.
            title: sanitizePlainText(data.title),
            auditScope: sanitizeOptional(data.scope),
            criteria: sanitizeOptional(data.criteria),
            schedule: data.schedule ? new Date(data.schedule) : null,
            auditors: sanitizeOptional(data.auditors),
            auditees: sanitizeOptional(data.auditees),
            departments: sanitizeOptional(data.departments),
            // B8 — frameworkKey is plain-text (the Framework.key
            // column itself is plain ASCII) — sanitise to strip any
            // injected HTML / control chars before persistence.
            frameworkKey: data.frameworkKey ? sanitizePlainText(data.frameworkKey) : null,
            status: 'PLANNED',
        });

        if (data.generateChecklist) {
            // The checklist must reflect the audit's SELECTED framework — an
            // OWASP audit gets OWASP clauses, an ISO 27001 audit gets ISO
            // clauses, etc. Derive the items from that framework's requirement
            // set (global catalogue, keyed by `Framework.key`). Only when the
            // audit has no framework (ad-hoc / multi-framework) do we fall
            // back to the tenant's controls so the checklist is never empty.
            let order = 0;

            if (audit.frameworkKey) {
                const framework = await db.framework.findFirst({
                    where: { key: audit.frameworkKey },
                    select: { id: true },
                });
                if (framework) {
                    const requirements = await db.frameworkRequirement.findMany({
                        where: { frameworkId: framework.id, deprecatedAt: null },
                        orderBy: { sortOrder: 'asc' },
                        take: 100,
                        select: { code: true, title: true },
                    });
                    for (const req of requirements) {
                        const label = req.title
                            ? `Verify ${req.code} — ${req.title}: confirm implementation and evidence`
                            : `Verify ${req.code}: confirm implementation and evidence`;
                        await AuditRepository.createChecklistItem(db, ctx, audit.id, label, order++);
                    }
                }
            }

            // Fallback: no framework selected, or the framework had no
            // requirements — seed from the tenant's controls instead.
            if (order === 0) {
                const controls = await db.control.findMany({
                    where: { OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
                    take: 20,
                });
                for (const ctrl of controls.slice(0, 15)) {
                    const prompt = `Verify control "${ctrl.name}" (${ctrl.annexId || 'Custom'}): check implementation status and evidence`;
                    await AuditRepository.createChecklistItem(db, ctx, audit.id, prompt, order++);
                }
            }
        }

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Audit',
            entityId: audit.id,
            details: `Created audit: ${audit.title}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Audit',
                operation: 'created',
                after: { title: audit.title, status: 'PLANNED', generateChecklist: !!data.generateChecklist },
                summary: `Created audit: ${audit.title}`,
            },
        });

        return audit;
    });
}

export async function updateAudit(ctx: RequestContext, id: string, data: z.infer<typeof UpdateAuditSchema>) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const audit = await AuditRepository.update(db, ctx, id, {
            // Epic D.2 — sanitise on update only when the field is
            // actually being written.
            title: sanitizeOptional(data.title) ?? undefined,
            auditScope: sanitizeOptional(data.scope),
            criteria: sanitizeOptional(data.criteria),

            status: data.status as AuditStatus | undefined,
            auditors: sanitizeOptional(data.auditors),
            auditees: sanitizeOptional(data.auditees),
        });

        if (!audit) throw notFound('Audit not found');

        if (data.checklistUpdates) {
            for (const item of data.checklistUpdates) {
                await AuditRepository.updateChecklistItem(db, ctx, item.id, {
                    // `result` is enum-shaped; do NOT sanitise.
                    result: item.result,
                    // `notes` is encrypted on AuditChecklistItem.notes
                    // and free-text — sanitise per element.
                    notes: typeof item.notes === 'string'
                        ? sanitizePlainText(item.notes)
                        : item.notes,
                });
            }
        }

        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'Audit',
            entityId: id,
            details: JSON.stringify(data),
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Audit',
                operation: 'updated',
                changedFields: Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined),
                summary: 'Audit updated',
            },
        });

        return audit;
    });
}

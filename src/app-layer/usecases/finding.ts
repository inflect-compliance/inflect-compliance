import { RequestContext } from '../types';
import { FindingRepository } from '../repositories/FindingRepository';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import { sanitizePlainText } from '@/lib/security/sanitize';
import type { FindingSeverity, FindingType, FindingStatus } from '@prisma/client';
import { z } from 'zod';
import { CreateFindingSchema, UpdateFindingSchema } from '@/lib/schemas';

// Epic D.2 — sanitise optional free-text on UPDATE without disturbing
// the three-state contract: undefined → don't touch, null → SET NULL,
// string → sanitise + SET. The shared `sanitizePlainText` helper
// returns '' for null/undefined inputs, which would silently turn an
// "untouched" column into an empty-string write — hence this guard.
function sanitizeOptional(v: string | null | undefined): string | null | undefined {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return sanitizePlainText(v);
}

export async function listFindings(
    ctx: RequestContext,
    options: { take?: number } = {},
) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        FindingRepository.list(db, ctx, options)
    );
}

export async function getFinding(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const finding = await FindingRepository.getById(db, ctx, id);
        if (!finding) throw notFound('Finding not found');
        return finding;
    });
}

export async function createFinding(ctx: RequestContext, data: z.infer<typeof CreateFindingSchema>) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const finding = await FindingRepository.create(db, ctx, {
            auditId: data.auditId || null,
            severity: data.severity as FindingSeverity,
            type: data.type as FindingType,
            // Epic D.2 — sanitise free-text before persistence. Encryption
            // protects confidentiality at rest; sanitisation protects
            // every downstream renderer (UI, PDF, audit-pack, SDK) that
            // reads the row verbatim.
            title: sanitizePlainText(data.title),
            description: data.description ? sanitizePlainText(data.description) : '',
            rootCause: data.rootCause ? sanitizePlainText(data.rootCause) : data.rootCause,
            correctiveAction: data.correctiveAction
                ? sanitizePlainText(data.correctiveAction)
                : data.correctiveAction,
            owner: data.owner ? sanitizePlainText(data.owner) : data.owner,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            status: 'OPEN',
        });

        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Finding',
            entityId: finding.id,
            details: `Created finding: ${finding.title}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Finding',
                operation: 'created',
                after: { title: finding.title, severity: data.severity, type: data.type },
                summary: `Created finding: ${finding.title}`,
            },
        });

        return finding;
    });
}

export async function updateFinding(ctx: RequestContext, id: string, data: z.infer<typeof UpdateFindingSchema>) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const oldFinding = await FindingRepository.getById(db, ctx, id);
        if (!oldFinding) throw notFound('Finding not found');

        const finding = await FindingRepository.update(db, ctx, id, {
            severity: data.severity as FindingSeverity | undefined,
            type: data.type as FindingType | undefined,
            // Epic D.2 — sanitise on update only when the field is
            // actually being written (preserves "don't touch" semantics).
            title: sanitizeOptional(data.title) ?? undefined,
            description: sanitizeOptional(data.description) ?? undefined,
            rootCause: sanitizeOptional(data.rootCause) ?? undefined,
            correctiveAction: sanitizeOptional(data.correctiveAction) ?? undefined,
            owner: sanitizeOptional(data.owner) ?? undefined,
            dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
            status: data.status as FindingStatus | undefined,
            verificationNotes: sanitizeOptional(data.verificationNotes) ?? undefined,
            verifiedBy: data.status === 'CLOSED' ? ctx.userId : undefined,
            verifiedAt: data.status === 'CLOSED' ? new Date() : undefined,
        });

        if (!finding) throw notFound('Finding not found');

        if (data.status && data.status !== oldFinding.status) {
            await logEvent(db, ctx, {
                action: 'STATUS_CHANGE',
                entityType: 'Finding',
                entityId: id,
                details: `${oldFinding.status} → ${data.status}`,
                detailsJson: {
                    category: 'status_change',
                    entityName: 'Finding',
                    fromStatus: oldFinding.status,
                    toStatus: data.status,
                    reason: data.verificationNotes || undefined,
                },
            });
        } else {
            await logEvent(db, ctx, {
                action: 'UPDATE',
                entityType: 'Finding',
                entityId: id,
                details: `Finding updated`,
                detailsJson: {
                    category: 'entity_lifecycle',
                    entityName: 'Finding',
                    operation: 'updated',
                    changedFields: Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined),
                    after: { title: data.title, severity: data.severity, owner: data.owner },
                    summary: 'Finding updated',
                },
            });
        }

        return finding;
    });
}

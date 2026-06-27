/**
 * Evidence-to-Retain linkage for policies.
 *
 * A policy's "Evidence to Retain" section is parsed best-effort into
 * checklist items (PolicyEvidenceItem) when the policy is created from a
 * template. This module lets the tenant link each item to a real
 * Evidence record — turning the policy's operational proof from prose
 * into navigable links. Mirrors the control→evidence link pattern.
 */
import { RequestContext } from '../types';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { notFound, badRequest } from '@/lib/errors/types';
import { sanitizePlainText } from '@/lib/security/sanitize';

export async function listPolicyEvidenceItems(ctx: RequestContext, policyId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.policyEvidenceItem.findMany({
            where: { tenantId: ctx.tenantId, policyId },
            orderBy: { sortOrder: 'asc' },
            include: { evidence: { select: { id: true, title: true, type: true, retentionUntil: true } } },
            take: 200,
        }),
    );
}

/** Add a manual evidence-to-retain checklist item to a policy. */
export async function addPolicyEvidenceItem(ctx: RequestContext, policyId: string, label: string) {
    assertCanWrite(ctx);
    const clean = sanitizePlainText(label).trim().slice(0, 500);
    if (!clean) throw badRequest('Empty label');

    return runInTenantContext(ctx, async (db) => {
        const policy = await db.policy.findFirst({ where: { id: policyId, tenantId: ctx.tenantId }, select: { id: true } });
        if (!policy) throw notFound('Policy not found');

        const max = await db.policyEvidenceItem.findFirst({
            where: { tenantId: ctx.tenantId, policyId },
            orderBy: { sortOrder: 'desc' },
            select: { sortOrder: true },
        });
        const item = await db.policyEvidenceItem.create({
            data: { tenantId: ctx.tenantId, policyId, label: clean, sortOrder: (max?.sortOrder ?? -1) + 1 },
        });
        await logEvent(db, ctx, {
            action: 'POLICY_EVIDENCE_ITEM_ADDED',
            entityType: 'Policy',
            entityId: policyId,
            details: `Added evidence-to-retain item: ${clean}`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'PolicyEvidenceItem', operation: 'created', summary: 'Evidence item added' },
            metadata: { itemId: item.id },
        });
        return item;
    });
}

/** Link an evidence-to-retain item to a real Evidence record. */
export async function linkPolicyEvidenceItem(
    ctx: RequestContext,
    policyId: string,
    itemId: string,
    evidenceId: string,
) {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const item = await db.policyEvidenceItem.findFirst({
            where: { id: itemId, policyId, tenantId: ctx.tenantId },
            select: { id: true },
        });
        if (!item) throw notFound('Evidence item not found');

        const evidence = await db.evidence.findFirst({
            where: { id: evidenceId, tenantId: ctx.tenantId },
            select: { id: true, title: true },
        });
        if (!evidence) throw badRequest('Evidence not found for this tenant');

        await db.policyEvidenceItem.updateMany({
            where: { id: itemId, tenantId: ctx.tenantId },
            data: { evidenceId },
        });

        await logEvent(db, ctx, {
            action: 'POLICY_EVIDENCE_LINKED',
            entityType: 'Policy',
            entityId: policyId,
            details: `Linked evidence "${evidence.title}" to checklist item`,
            detailsJson: {
                category: 'relationship',
                operation: 'linked',
                sourceEntity: 'Policy',
                sourceId: policyId,
                targetEntity: 'Evidence',
                targetId: evidenceId,
                relation: 'EVIDENCE_TO_RETAIN',
            },
            metadata: { itemId },
        });
        return { itemId, evidenceId };
    });
}

/** Clear the evidence link on a checklist item (item stays as an open entry). */
export async function unlinkPolicyEvidenceItem(ctx: RequestContext, policyId: string, itemId: string) {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const item = await db.policyEvidenceItem.findFirst({
            where: { id: itemId, policyId, tenantId: ctx.tenantId },
            select: { id: true, evidenceId: true },
        });
        if (!item) throw notFound('Evidence item not found');

        await db.policyEvidenceItem.updateMany({
            where: { id: itemId, tenantId: ctx.tenantId },
            data: { evidenceId: null },
        });

        await logEvent(db, ctx, {
            action: 'POLICY_EVIDENCE_UNLINKED',
            entityType: 'Policy',
            entityId: policyId,
            details: `Unlinked evidence from checklist item`,
            detailsJson: {
                category: 'relationship',
                operation: 'unlinked',
                sourceEntity: 'Policy',
                sourceId: policyId,
                targetEntity: 'Evidence',
                targetId: item.evidenceId ?? 'none',
                relation: 'EVIDENCE_TO_RETAIN',
            },
            metadata: { itemId },
        });
        return { itemId };
    });
}

import { RequestContext } from '../types';
import { PolicyRepository, PolicyFilters, PolicyListParams } from '../repositories/PolicyRepository';
import { PolicyVersionRepository } from '../repositories/PolicyVersionRepository';
import { PolicyApprovalRepository } from '../repositories/PolicyApprovalRepository';
import { PolicyTemplateRepository } from '../repositories/PolicyTemplateRepository';
import { assertCanRead, assertCanWrite, assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { enqueueEmail } from '../notifications/enqueue';
import { notFound, badRequest, forbidden, conflict } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import { sanitizePolicyContent } from '@/lib/security/sanitize';
import { logger } from '@/lib/observability/logger';

// ─── Slug helper ───

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 80);
}

// ─── Queries ───

export async function listPolicies(
    ctx: RequestContext,
    filters?: PolicyFilters,
    options: { take?: number } = {},
) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        PolicyRepository.list(db, ctx, filters, options)
    );
}

export async function listPoliciesPaginated(ctx: RequestContext, params: PolicyListParams) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        PolicyRepository.listPaginated(db, ctx, params)
    );
}

export async function getPolicy(ctx: RequestContext, policyId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');
        return policy;
    });
}

export async function listPolicyTemplates(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        PolicyTemplateRepository.list(db)
    );
}

export async function getPolicyActivity(ctx: RequestContext, policyId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.auditLog.findMany({
            where: {
                tenantId: ctx.tenantId,
                entity: 'Policy',
                entityId: policyId,
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                user: { select: { id: true, name: true } },
            },
        })
    );
}


// ─── Create ───

export async function createPolicy(ctx: RequestContext, data: {
    title: string;
    description?: string | null;
    category?: string | null;
    ownerUserId?: string | null;
    reviewFrequencyDays?: number | null;
    language?: string | null;
    content?: string | null;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        // Generate unique slug
        let baseSlug = slugify(data.title);
        if (!baseSlug) baseSlug = 'policy';
        let slug = baseSlug;
        let counter = 0;
        while (await PolicyRepository.getBySlug(db, ctx, slug)) {
            counter++;
            slug = `${baseSlug}-${counter}`;
        }

        const policy = await PolicyRepository.create(db, ctx, {
            slug,
            title: data.title,
            description: data.description,
            category: data.category,
            ownerUserId: data.ownerUserId,
            reviewFrequencyDays: data.reviewFrequencyDays,
            language: data.language,
        });

        // Create initial version if content provided. Sanitised
        // before persistence — same contract as createPolicyVersion.
        if (data.content) {
            const version = await PolicyVersionRepository.create(db, ctx, policy.id, {
                contentType: 'MARKDOWN',
                contentText: sanitizePolicyContent('MARKDOWN', data.content),
                changeSummary: 'Initial version',
            });
            await PolicyRepository.setCurrentVersion(db, ctx, policy.id, version.id);
        }

        await logEvent(db, ctx, {
            action: 'POLICY_CREATED',
            entityType: 'Policy',
            entityId: policy.id,
            details: `Created policy: ${policy.title}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Policy',
                operation: 'created',
                after: { title: policy.title, slug: policy.slug, category: data.category || null },
                summary: `Created policy: ${policy.title}`,
            },
        });

        return policy;
    });
}

export async function createPolicyFromTemplate(ctx: RequestContext, templateId: string, overrides?: {
    title?: string;
    description?: string | null;
    category?: string | null;
    ownerUserId?: string | null;
    language?: string | null;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const template = await PolicyTemplateRepository.getById(db, templateId);
        if (!template) throw notFound('Policy template not found');

        const title = overrides?.title || template.title;
        let baseSlug = slugify(title);
        if (!baseSlug) baseSlug = 'policy';
        let slug = baseSlug;
        let counter = 0;
        while (await PolicyRepository.getBySlug(db, ctx, slug)) {
            counter++;
            slug = `${baseSlug}-${counter}`;
        }

        const policy = await PolicyRepository.create(db, ctx, {
            slug,
            title,
            description: overrides?.description ?? null,
            category: overrides?.category || template.category,
            ownerUserId: overrides?.ownerUserId,
            language: overrides?.language || template.language,
        });

        // Create version from template content
        const version = await PolicyVersionRepository.create(db, ctx, policy.id, {
            contentType: template.contentType,
            contentText: template.contentText,
            changeSummary: `Created from template: ${template.title}`,
        });
        await PolicyRepository.setCurrentVersion(db, ctx, policy.id, version.id);

        await logEvent(db, ctx, {
            action: 'POLICY_CREATED',
            entityType: 'Policy',
            entityId: policy.id,
            details: `Created from template: ${template.title}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Policy',
                operation: 'created',
                after: { title, templateId: template.id, templateTitle: template.title },
                summary: `Created from template: ${template.title}`,
            },
            metadata: { templateId: template.id },
        });

        return policy;
    });
}

// ─── Version ───

export async function createPolicyVersion(ctx: RequestContext, policyId: string, data: {
    contentType: string;
    contentText?: string | null;
    externalUrl?: string | null;
    changeSummary?: string | null;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');

        if (policy.status === 'ARCHIVED') {
            throw badRequest('Cannot create version for an archived policy');
        }

        // Validate content based on type
        if (data.contentType === 'EXTERNAL_LINK' && !data.externalUrl) {
            throw badRequest('externalUrl is required for EXTERNAL_LINK content type');
        }
        if ((data.contentType === 'MARKDOWN' || data.contentType === 'HTML') && !data.contentText) {
            throw badRequest('contentText is required for MARKDOWN/HTML content type');
        }

        // Epic C.5 — sanitise BEFORE the repository write so the
        // stored row never carries dangerous HTML. HTML content gets
        // the rich-text allowlist; MARKDOWN/EXTERNAL_LINK get
        // plain-text stripping (markdown's renderer escapes; embedded
        // raw HTML inside a markdown blob would bypass it).
        const safeData =
            data.contentText && (
                data.contentType === 'HTML'
                || data.contentType === 'MARKDOWN'
                || data.contentType === 'EXTERNAL_LINK'
            )
                ? {
                      ...data,
                      contentText: sanitizePolicyContent(
                          data.contentType as 'HTML' | 'MARKDOWN' | 'EXTERNAL_LINK',
                          data.contentText,
                      ),
                  }
                : data;

        const version = await PolicyVersionRepository.create(db, ctx, policyId, safeData);

        // Move policy back to DRAFT if it was in a published/approved state
        if (policy.status === 'PUBLISHED' || policy.status === 'APPROVED') {
            await PolicyRepository.updateStatus(db, ctx, policyId, 'DRAFT');
        }

        await logEvent(db, ctx, {
            action: 'POLICY_VERSION_CREATED',
            entityType: 'Policy',
            entityId: policyId,
            details: `Version ${version.versionNumber} created`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'PolicyVersion',
                operation: 'created',
                after: { versionId: version.id, versionNumber: version.versionNumber, contentType: data.contentType },
                summary: `Version ${version.versionNumber} created`,
            },
            metadata: { versionId: version.id, versionNumber: version.versionNumber },
        });

        return version;
    });
}

// ─── Metadata ───

export async function updatePolicyMetadata(ctx: RequestContext, policyId: string, data: {
    title?: string;
    description?: string | null;
    category?: string | null;
    ownerUserId?: string | null;
    reviewFrequencyDays?: number | null;
    nextReviewAt?: string | null;
    language?: string | null;
}) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');

        const updateData: Record<string, unknown> = { ...data };
        if (data.nextReviewAt !== undefined) {
            updateData.nextReviewAt = data.nextReviewAt ? new Date(data.nextReviewAt) : null;
        }

        await PolicyRepository.updateMetadata(db, ctx, policyId, updateData);

        await logEvent(db, ctx, {
            action: 'POLICY_UPDATED',
            entityType: 'Policy',
            entityId: policyId,
            details: `Metadata updated`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Policy',
                operation: 'updated',
                changedFields: Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined),
                after: data,
                summary: 'Policy metadata updated',
            },
            metadata: data,
        });

        return PolicyRepository.getById(db, ctx, policyId);
    });
}

// ─── Approval Workflow ───

export async function requestPolicyApproval(ctx: RequestContext, policyId: string, versionId: string) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');

        // Verify the version belongs to this policy
        const version = await PolicyVersionRepository.getById(db, versionId);
        if (!version || version.policyId !== policyId) {
            throw badRequest('Version does not belong to this policy');
        }

        // Move policy to IN_REVIEW
        await PolicyRepository.updateStatus(db, ctx, policyId, 'IN_REVIEW');

        const approval = await PolicyApprovalRepository.request(db, ctx, policyId, versionId);

        await logEvent(db, ctx, {
            action: 'POLICY_APPROVAL_REQUESTED',
            entityType: 'Policy',
            entityId: policyId,
            details: `Approval requested for version ${version.versionNumber}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'Policy',
                fromStatus: policy.status,
                toStatus: 'IN_REVIEW',
                reason: `Approval requested for version ${version.versionNumber}`,
            },
            metadata: { versionId, approvalId: approval.id },
        });

        // Notify admin users with POLICY_APPROVAL_REQUESTED email
        try {
            const requester = await db.user.findUnique({
                where: { id: ctx.userId },
                select: { name: true },
            });
            const admins = await db.tenantMembership.findMany({
                where: { tenantId: ctx.tenantId, role: 'ADMIN' },
                include: { user: { select: { email: true, name: true } } },
            });
            for (const m of admins) {
                if (!m.user.email) continue;
                await enqueueEmail(db, {
                    tenantId: ctx.tenantId,
                    type: 'POLICY_APPROVAL_REQUESTED',
                    toEmail: m.user.email,
                    entityId: policyId,
                    requestId: ctx.requestId,
                    payload: {
                        policyTitle: policy.title,
                        requesterName: requester?.name || 'A team member',
                        approverName: m.user.name || m.user.email,
                        versionNumber: version.versionNumber,
                        tenantSlug: ctx.tenantSlug || '',
                    },
                });
            }
        } catch (err) {
            logger.warn('failed to enqueue policy approval email', { component: 'notifications' });
        }

        return approval;
    });
}

export async function decidePolicyApproval(ctx: RequestContext, approvalId: string, decision: {
    decision: 'APPROVED' | 'REJECTED';
    comment?: string | null;
}) {
    assertCanAdmin(ctx);

    return runInTenantContext(ctx, async (db) => {
        const approval = await PolicyApprovalRepository.getById(db, ctx, approvalId);
        if (!approval) throw notFound('Approval request not found');

        // Verify tenant ownership
        if (approval.policy.tenantId !== ctx.tenantId) {
            throw forbidden('Access denied');
        }

        if (approval.status !== 'PENDING') {
            throw conflict('This approval request has already been decided');
        }

        const result = await PolicyApprovalRepository.decide(
            db, ctx, approvalId, decision.decision, decision.comment || undefined
        );
        if (!result) throw notFound('Approval request not found');

        // Update policy status based on decision
        if (decision.decision === 'APPROVED') {
            await PolicyRepository.updateStatus(db, ctx, approval.policyId, 'APPROVED');
        } else {
            await PolicyRepository.updateStatus(db, ctx, approval.policyId, 'DRAFT');
        }

        const action = decision.decision === 'APPROVED' ? 'POLICY_APPROVED' : 'POLICY_REJECTED';
        await logEvent(db, ctx, {
            action,
            entityType: 'Policy',
            entityId: approval.policyId,
            details: `Policy ${decision.decision.toLowerCase()}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'Policy',
                fromStatus: 'IN_REVIEW',
                toStatus: decision.decision === 'APPROVED' ? 'APPROVED' : 'DRAFT',
                reason: decision.comment || undefined,
            },
            metadata: { approvalId, decision: decision.decision, comment: decision.comment },
        });

        // Notify the requester about the decision
        try {
            const requester = await db.user.findUnique({
                where: { id: approval.requestedByUserId },
                select: { email: true, name: true },
            });
            const decider = await db.user.findUnique({
                where: { id: ctx.userId },
                select: { name: true },
            });
            if (requester?.email) {
                const emailType = decision.decision === 'APPROVED' ? 'POLICY_APPROVED' as const : 'POLICY_REJECTED' as const;
                await enqueueEmail(db, {
                    tenantId: ctx.tenantId,
                    type: emailType,
                    toEmail: requester.email,
                    entityId: approval.policyId,
                    requestId: ctx.requestId,
                    payload: {
                        policyTitle: approval.policy.title,
                        decision: decision.decision,
                        deciderName: decider?.name || 'An administrator',
                        requesterName: requester.name || requester.email,
                        comment: decision.comment,
                        tenantSlug: ctx.tenantSlug || '',
                    },
                });
            }
        } catch (err) {
            logger.warn('failed to enqueue policy decision email', { component: 'notifications' });
        }

        return result;
    });
}

// ─── Publish / Archive ───

/**
 * Audit Coherence S4 (2026-05-22) — `publishPolicy` previously
 * accepted any policy regardless of status (an admin could publish a
 * DRAFT, bypassing the approval workflow entirely). The audit
 * recommended either blocking non-APPROVED publishes outright OR
 * audit-logging the bypass. This implementation does BOTH:
 *
 *   - DEFAULT: refuses to publish unless `policy.status === 'APPROVED'`.
 *   - BYPASS: passing `bypassApprovalReason` allows publishing from
 *     any pre-PUBLISHED status, but the bypass + the reason are
 *     captured in a dedicated audit row (`POLICY_PUBLISH_BYPASS`).
 *
 * The bypass exists because real-world emergencies (hot-fix to a
 * security policy mid-incident) shouldn't be entirely blocked, but
 * they MUST be auditable + justified.
 */
export interface PublishPolicyOptions {
    /**
     * If set, allows publishing a policy that isn't APPROVED. The
     * reason is captured verbatim in the bypass audit row and
     * surfaces in the policy's audit history for review. Empty /
     * whitespace-only reasons are rejected.
     */
    bypassApprovalReason?: string;
}

export async function publishPolicy(
    ctx: RequestContext,
    policyId: string,
    versionId: string,
    options: PublishPolicyOptions = {},
) {
    assertCanAdmin(ctx);

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');

        // Verify the version belongs to this policy
        const version = await PolicyVersionRepository.getById(db, versionId);
        if (!version || version.policyId !== policyId) {
            throw badRequest('Version does not belong to this policy');
        }

        // Audit S4 — approval gate. Default refuses non-APPROVED;
        // `bypassApprovalReason` opens the door but logs the bypass.
        const isApproved = policy.status === 'APPROVED';
        const bypassReason = options.bypassApprovalReason?.trim() ?? '';
        if (!isApproved && bypassReason.length === 0) {
            throw badRequest(
                `Policy ${policyId} is ${policy.status}; cannot publish without going through APPROVED. ` +
                    `If this is an emergency override, supply bypassApprovalReason to record the bypass.`,
            );
        }

        // Set as current version and publish
        await PolicyRepository.setCurrentVersion(db, ctx, policyId, versionId);
        await PolicyRepository.updateStatus(db, ctx, policyId, 'PUBLISHED');

        // If we got here via the bypass path, emit the dedicated
        // audit row BEFORE the POLICY_PUBLISHED event so the timeline
        // reads "bypass first, then publish".
        if (!isApproved) {
            await logEvent(db, ctx, {
                action: 'POLICY_PUBLISH_BYPASS',
                entityType: 'Policy',
                entityId: policyId,
                details: `Bypassed APPROVED gate to publish from ${policy.status}: ${bypassReason}`,
                detailsJson: {
                    category: 'status_change',
                    entityName: 'Policy',
                    fromStatus: policy.status,
                    summary: `Approval gate bypassed (was ${policy.status})`,
                    after: {
                        bypassReason,
                        versionId,
                        versionNumber: version.versionNumber,
                    },
                },
            });
        }

        await logEvent(db, ctx, {
            action: 'POLICY_PUBLISHED',
            entityType: 'Policy',
            entityId: policyId,
            details: `Published version ${version.versionNumber}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'Policy',
                fromStatus: policy.status,
                toStatus: 'PUBLISHED',
                reason: `Published version ${version.versionNumber}`,
            },
            metadata: { versionId, versionNumber: version.versionNumber },
        });

        return PolicyRepository.getById(db, ctx, policyId);
    });
}

export async function archivePolicy(ctx: RequestContext, policyId: string) {
    assertCanAdmin(ctx);

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');

        await PolicyRepository.updateStatus(db, ctx, policyId, 'ARCHIVED');

        await logEvent(db, ctx, {
            action: 'POLICY_ARCHIVED',
            entityType: 'Policy',
            entityId: policyId,
            details: `Policy archived: ${policy.title}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'Policy',
                fromStatus: policy.status,
                toStatus: 'ARCHIVED',
            },
        });

        return { success: true };
    });
}

// ─── Soft Delete / Restore / Purge ───

import { restoreEntity, purgeEntity } from './soft-delete-operations';
import { withDeleted } from '@/lib/soft-delete';

export async function deletePolicy(ctx: RequestContext, id: string) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, id);
        if (!policy) throw notFound('Policy not found');

        await db.policy.delete({ where: { id } });

        await logEvent(db, ctx, {
            action: 'SOFT_DELETE',
            entityType: 'Policy',
            entityId: id,
            details: `Policy soft-deleted: ${policy.title}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Policy',
                operation: 'deleted',
                before: { title: policy.title, status: policy.status },
                summary: `Policy soft-deleted: ${policy.title}`,
            },
        });
        return { success: true };
    });
}

export async function restorePolicy(ctx: RequestContext, id: string) {
    return restoreEntity(ctx, 'Policy', id);
}

export async function purgePolicy(ctx: RequestContext, id: string) {
    return purgeEntity(ctx, 'Policy', id);
}

export async function listPoliciesWithDeleted(ctx: RequestContext) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, (db) =>
        db.policy.findMany(withDeleted({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' as const } }))
    );
}

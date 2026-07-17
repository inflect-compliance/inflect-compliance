import { Prisma } from '@prisma/client';
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
import { sanitizePolicyContent, sanitizePlainText } from '@/lib/security/sanitize';
import { parseReviewCadenceDays, parseEvidenceToRetain } from '@/lib/policy/template-skeleton';
import { logger } from '@/lib/observability/logger';
import { recordPolicyPublished } from '@/lib/observability/business-metrics';

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
    /** Initial-version editor mode (Prompt-3.3). Defaults to MARKDOWN. */
    contentType?: 'MARKDOWN' | 'HTML';
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
            const initialContentType = data.contentType ?? 'MARKDOWN';
            const version = await PolicyVersionRepository.create(db, ctx, policy.id, {
                contentType: initialContentType,
                contentText: sanitizePolicyContent(initialContentType, data.content),
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

        // Adopt the template's canonical structure into operational data:
        //   - "Document Control" review cadence → reviewFrequencyDays +
        //     a first nextReviewAt (the tenant adjusts).
        //   - owner defaults to the creating user.
        // Best-effort: a template without a parseable cadence leaves the
        // fields null (no schedule) rather than guessing.
        const cadenceDays = parseReviewCadenceDays(template.contentText);
        const nextReviewAt = cadenceDays ? new Date(Date.now() + cadenceDays * 86_400_000) : null;

        const policy = await PolicyRepository.create(db, ctx, {
            slug,
            title,
            description: overrides?.description ?? null,
            category: overrides?.category || template.category,
            ownerUserId: overrides?.ownerUserId ?? ctx.userId,
            reviewFrequencyDays: cadenceDays,
            nextReviewAt,
            language: overrides?.language || template.language,
        });

        // Create version from template content
        const version = await PolicyVersionRepository.create(db, ctx, policy.id, {
            contentType: template.contentType,
            contentText: template.contentText,
            changeSummary: `Created from template: ${template.title}`,
        });
        await PolicyRepository.setCurrentVersion(db, ctx, policy.id, version.id);

        // "Evidence to Retain" → checklist items (label only; the tenant
        // links real Evidence on the detail page). Sanitised free text.
        const evidenceLabels = parseEvidenceToRetain(template.contentText);
        if (evidenceLabels.length) {
            await db.policyEvidenceItem.createMany({
                data: evidenceLabels.map((label, i) => ({
                    tenantId: ctx.tenantId,
                    policyId: policy.id,
                    label: sanitizePlainText(label).slice(0, 500),
                    sortOrder: i,
                })),
            });
        }

        await logEvent(db, ctx, {
            action: 'POLICY_CREATED',
            entityType: 'Policy',
            entityId: policy.id,
            details: `Created from template: ${template.title}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Policy',
                operation: 'created',
                after: {
                    title,
                    templateId: template.id,
                    templateTitle: template.title,
                    reviewFrequencyDays: cadenceDays,
                    evidenceItemCount: evidenceLabels.length,
                },
                summary: `Created from template: ${template.title}`,
            },
            metadata: { templateId: template.id },
        });

        return policy;
    });
}

/**
 * Mark a policy as reviewed (periodic re-validation — distinct from
 * PolicyApproval's initial sign-off). Stamps lastReviewedAt = now and
 * recomputes nextReviewAt = now + reviewFrequencyDays. A policy with no
 * cadence keeps whatever nextReviewAt it already has — a manually-set
 * review date must survive a "mark reviewed" click, not be wiped. Audited.
 */
export async function markPolicyReviewed(ctx: RequestContext, policyId: string) {
    assertCanWrite(ctx);

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');

        const now = new Date();
        // With a cadence, recompute the next review date. Without one,
        // PRESERVE any explicitly-set nextReviewAt rather than clearing it.
        const nextReviewAt = policy.reviewFrequencyDays
            ? new Date(now.getTime() + policy.reviewFrequencyDays * 86_400_000)
            : policy.nextReviewAt;

        await PolicyRepository.updateMetadata(db, ctx, policyId, {
            lastReviewedAt: now,
            nextReviewAt,
        });

        await logEvent(db, ctx, {
            action: 'POLICY_REVIEWED',
            entityType: 'Policy',
            entityId: policyId,
            details: `Policy reviewed${nextReviewAt ? `; next review ${nextReviewAt.toISOString().slice(0, 10)}` : ''}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'Policy',
                operation: 'reviewed',
                after: {
                    lastReviewedAt: now.toISOString(),
                    nextReviewAt: nextReviewAt?.toISOString() ?? null,
                },
                summary: `Policy marked reviewed`,
            },
        });

        return PolicyRepository.getById(db, ctx, policyId);
    });
}

// ─── Version ───

export async function createPolicyVersion(ctx: RequestContext, policyId: string, data: {
    contentType: string;
    contentText?: string | null;
    externalUrl?: string | null;
    changeSummary?: string | null;
}, opts: {
    /**
     * Prompt-3.2 — when true, a new version on a PUBLISHED/APPROVED policy is a
     * *proposed* draft: the live published version and status are NOT demoted.
     * The proposal must go through request-approval → publish to replace the
     * live version. Used by the SharePoint pull so an external edit never
     * silently un-publishes a live policy (stranding its acknowledgements).
     */
    proposeOnly?: boolean;
} = {}) {
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

        const wasLive = policy.status === 'PUBLISHED' || policy.status === 'APPROVED';
        // Move policy back to DRAFT if it was published/approved — UNLESS this is
        // a *proposed* external change (Prompt-3.2), which must not demote the
        // live published version; the proposal awaits its own approval instead.
        if (wasLive && !opts.proposeOnly) {
            await PolicyRepository.updateStatus(db, ctx, policyId, 'DRAFT');
        }
        if (wasLive && opts.proposeOnly) {
            await logEvent(db, ctx, {
                action: 'POLICY_EXTERNAL_CHANGE_PROPOSED',
                entityType: 'Policy',
                entityId: policyId,
                details: `External change proposed as version ${version.versionNumber} (live ${policy.status} version unchanged)`,
                detailsJson: {
                    category: 'entity_lifecycle',
                    entityName: 'Policy',
                    summary: `External change proposed as v${version.versionNumber}; live ${policy.status} version retained pending re-approval`,
                    after: { versionId: version.id, versionNumber: version.versionNumber, retainedStatus: policy.status },
                },
                metadata: { versionId: version.id, versionNumber: version.versionNumber },
            });
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

        // Segregation of duties — the requester of a policy change may not
        // APPROVE their own request. No per-tenant toggle exists today, so this
        // is enforced unconditionally. A self-REJECTION is still allowed so a
        // requester can withdraw a change without stranding it in IN_REVIEW.
        if (decision.decision === 'APPROVED' && approval.requestedByUserId === ctx.userId) {
            throw forbidden(
                'Separation of duties: you cannot approve a policy change you requested. Another administrator must approve it.',
            );
        }

        // SoD also covers AUTHORSHIP: when the version author differs from the
        // requester, an admin who WROTE the version must not approve it either.
        // (Previously only the requester was blocked, so a self-authored version
        // requested by someone else could be self-approved.)
        if (decision.decision === 'APPROVED') {
            const version = await db.policyVersion.findFirst({
                where: { id: approval.policyVersionId, tenantId: ctx.tenantId },
                select: { createdById: true },
            });
            if (version?.createdById === ctx.userId) {
                throw forbidden(
                    'Separation of duties: you cannot approve a policy version you authored. Another administrator must approve it.',
                );
            }
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
/**
 * A prior published snapshot recorded in `Policy.lifecycleHistoryJson` (Prompt-3.1).
 * `versionId` is the still-existing PolicyVersion that rollback re-publishes.
 */
export interface PolicyLifecycleSnapshot {
    /** lifecycleVersion at the time this snapshot was the live published version. */
    version: number;
    versionId: string;
    versionNumber: number;
    changeSummary: string | null;
    /** ISO timestamp — when this published version was superseded. */
    supersededAt: string;
    supersededByUserId: string;
}

const MAX_LIFECYCLE_HISTORY = 20;

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

    const published = await runInTenantContext(ctx, async (db) => {
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

        // ── Lifecycle history + counter (Prompt-3.1) ──
        // Snapshot the OUTGOING published version (the one being replaced) into
        // lifecycleHistoryJson and bump lifecycleVersion, so the list version
        // column reflects real published lineage and rollback has a target.
        const priorHistory: PolicyLifecycleSnapshot[] = Array.isArray(policy.lifecycleHistoryJson)
            ? (policy.lifecycleHistoryJson as unknown as PolicyLifecycleSnapshot[])
            : [];
        let nextHistory = priorHistory;
        // Capture the OUTGOING version when it was previously published
        // (lifecycleVersion > 1 ⇒ at least one prior publish; currentVersionId
        // tracks the last-published version). status may already be DRAFT here
        // because creating the new version demoted it — so gate on the counter,
        // not the live status.
        if (
            policy.lifecycleVersion > 1 &&
            policy.currentVersionId &&
            policy.currentVersionId !== versionId &&
            policy.currentVersion
        ) {
            nextHistory = [
                ...priorHistory,
                {
                    version: policy.lifecycleVersion,
                    versionId: policy.currentVersionId,
                    versionNumber: policy.currentVersion.versionNumber,
                    changeSummary: policy.currentVersion.changeSummary ?? null,
                    supersededAt: new Date().toISOString(),
                    supersededByUserId: ctx.userId,
                },
            ].slice(-MAX_LIFECYCLE_HISTORY);
        }

        // Set as current version and publish
        await PolicyRepository.setCurrentVersion(db, ctx, policyId, versionId);
        await PolicyRepository.updateStatus(db, ctx, policyId, 'PUBLISHED');
        await db.policy.update({
            where: { id: policyId },
            data: {
                lifecycleVersion: policy.lifecycleVersion + 1,
                lifecycleHistoryJson: nextHistory as unknown as Prisma.InputJsonValue,
            },
        });

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

    // SP-4 — push the freshly-published content to a linked SharePoint file.
    // Best-effort + OUTSIDE the publish transaction (the sync opens its own):
    // a SharePoint hiccup must never fail or roll back the publish.
    try {
        const { pushPolicyToSharePoint } = await import('./policy-sharepoint-sync');
        await pushPolicyToSharePoint(ctx, policyId);
    } catch (err) {
        const { edgeLogger } = await import('@/lib/observability/edge-logger');
        edgeLogger.error('Policy publish: SharePoint push failed', {
            component: 'sharepoint',
            policyId,
            error: err instanceof Error ? err.message : String(err),
        });
    }

    recordPolicyPublished();
    return published;
}

/**
 * Roll back to the previous published version (Prompt-3.1). Re-publishes the
 * PolicyVersion recorded in the most-recent `lifecycleHistoryJson` entry,
 * pops it off the history, and bumps `lifecycleVersion`. Admin-only.
 */
export async function rollbackPolicy(ctx: RequestContext, policyId: string) {
    assertCanAdmin(ctx);
    const result = await runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');

        // Status guard — an ARCHIVED policy is retired; rolling it straight to
        // PUBLISHED would resurrect it silently. Restore it first.
        if (policy.status === 'ARCHIVED') {
            throw badRequest('Cannot roll back an ARCHIVED policy. Restore it before rolling back.');
        }

        const history: PolicyLifecycleSnapshot[] = Array.isArray(policy.lifecycleHistoryJson)
            ? (policy.lifecycleHistoryJson as unknown as PolicyLifecycleSnapshot[])
            : [];
        if (history.length === 0) {
            throw badRequest('No previous published version to roll back to.');
        }
        const target = history[history.length - 1];

        const targetVersion = await PolicyVersionRepository.getById(db, target.versionId);
        if (!targetVersion || targetVersion.policyId !== policyId) {
            throw badRequest('The previous published version no longer exists.');
        }

        // Snapshot the OUTGOING version (the one being rolled away from) into
        // history — mirroring publishPolicy — so the rollback is REVERSIBLE
        // (you can roll forward again) and lifecycleHistoryJson doesn't drain to
        // empty while lifecycleVersion keeps climbing. Pop the target, push the
        // outgoing. Skip the push if the outgoing IS the target (self-rollback).
        const withoutTarget = history.slice(0, -1);
        const pushOutgoing =
            policy.currentVersionId &&
            policy.currentVersion &&
            policy.currentVersionId !== target.versionId;
        const nextHistory = (
            pushOutgoing
                ? [
                      ...withoutTarget,
                      {
                          version: policy.lifecycleVersion,
                          versionId: policy.currentVersionId!,
                          versionNumber: policy.currentVersion!.versionNumber,
                          changeSummary: policy.currentVersion!.changeSummary ?? null,
                          supersededAt: new Date().toISOString(),
                          supersededByUserId: ctx.userId,
                      },
                  ]
                : withoutTarget
        ).slice(-MAX_LIFECYCLE_HISTORY);

        await PolicyRepository.setCurrentVersion(db, ctx, policyId, target.versionId);
        await PolicyRepository.updateStatus(db, ctx, policyId, 'PUBLISHED');
        await db.policy.update({
            where: { id: policyId },
            data: {
                lifecycleVersion: policy.lifecycleVersion + 1,
                lifecycleHistoryJson: nextHistory as unknown as Prisma.InputJsonValue,
            },
        });

        await logEvent(db, ctx, {
            action: 'POLICY_ROLLED_BACK',
            entityType: 'Policy',
            entityId: policyId,
            details: `Rolled back to version ${target.versionNumber}`,
            detailsJson: {
                category: 'status_change',
                entityName: 'Policy',
                toStatus: 'PUBLISHED',
                summary: `Rolled back to previously-published version ${target.versionNumber}`,
                after: { versionId: target.versionId, versionNumber: target.versionNumber },
            },
            metadata: { versionId: target.versionId, versionNumber: target.versionNumber },
        });

        return PolicyRepository.getById(db, ctx, policyId);
    });

    // Push the restored content to a linked SharePoint file exactly as
    // publishPolicy does, so the external doc doesn't go stale. Best-effort,
    // OUTSIDE the transaction — a SharePoint hiccup must never fail the rollback.
    try {
        const { pushPolicyToSharePoint } = await import('./policy-sharepoint-sync');
        await pushPolicyToSharePoint(ctx, policyId);
    } catch (err) {
        const { edgeLogger } = await import('@/lib/observability/edge-logger');
        edgeLogger.error('Policy rollback: SharePoint push failed', {
            component: 'sharepoint',
            policyId,
            error: err instanceof Error ? err.message : String(err),
        });
    }

    return result;
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

// ─── Bulk actions (canonical BulkActionBar rollout — wave B) ───
// Assign owner + Archive only: Policy status is approval-gated (can't reach
// PUBLISHED without going through APPROVED), so there is no bulk status path
// that could bypass the workflow. Archive is the one safe terminal verb and
// keeps `archivePolicy`'s OWNER/ADMIN gate.

export async function bulkAssignPolicy(
    ctx: RequestContext,
    policyIds: string[],
    ownerUserId: string | null,
) {
    assertCanWrite(ctx);
    const updated = await runInTenantContext(ctx, async (db) => {
        const rows = await PolicyRepository.listByIds(db, ctx, policyIds);
        if (rows.length === 0) return 0;
        await PolicyRepository.bulkUpdate(db, ctx, policyIds, {
            ownerUserId: ownerUserId || null,
        });
        for (const r of rows) {
            await logEvent(db, ctx, {
                action: 'POLICY_UPDATED',
                entityType: 'Policy',
                entityId: r.id,
                details: ownerUserId ? `Policy owner reassigned` : `Policy owner cleared`,
                detailsJson: {
                    category: 'entity_lifecycle',
                    entityName: 'Policy',
                    operation: 'updated',
                    changedFields: ['ownerUserId'],
                    after: { ownerUserId: ownerUserId || null },
                    summary: ownerUserId ? `owner reassigned (bulk)` : `owner cleared (bulk)`,
                },
            });
        }
        return rows.length;
    });
    return { updated };
}

/** Bulk soft-delete policies selected in the table action bar. */
export async function bulkDeletePolicy(ctx: RequestContext, policyIds: string[]) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rows = await PolicyRepository.listByIds(db, ctx, policyIds);
        if (rows.length === 0) return { deleted: 0 };
        await db.policy.deleteMany({ where: { id: { in: rows.map((r) => r.id) }, tenantId: ctx.tenantId } });
        for (const r of rows) {
            await logEvent(db, ctx, {
                action: 'SOFT_DELETE',
                entityType: 'Policy',
                entityId: r.id,
                details: 'Policy soft-deleted (bulk)',
                detailsJson: { category: 'entity_lifecycle', entityName: 'Policy', operation: 'deleted', summary: 'Policy soft-deleted' },
            });
        }
        return { deleted: rows.length };
    });
}

export async function bulkArchivePolicy(ctx: RequestContext, policyIds: string[]) {
    assertCanAdmin(ctx);
    const updated = await runInTenantContext(ctx, async (db) => {
        const rows = await PolicyRepository.listByIds(db, ctx, policyIds);
        if (rows.length === 0) return 0;
        await PolicyRepository.bulkUpdate(db, ctx, policyIds, { status: 'ARCHIVED' });
        for (const r of rows) {
            await logEvent(db, ctx, {
                action: 'POLICY_ARCHIVED',
                entityType: 'Policy',
                entityId: r.id,
                details: `Policy archived: ${r.title}`,
                detailsJson: {
                    category: 'status_change',
                    entityName: 'Policy',
                    fromStatus: r.status,
                    toStatus: 'ARCHIVED',
                },
            });
        }
        return rows.length;
    });
    return { updated };
}

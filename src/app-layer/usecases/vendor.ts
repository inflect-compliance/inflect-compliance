import { z } from 'zod';
import { VendorStatus } from '@prisma/client';
import { RequestContext } from '../types';
import { VendorRepository, VendorDocumentRepository, VendorLinkRepository, VendorFilters, VendorListParams } from '../repositories/VendorRepository';
import { QuestionnaireRepository, VendorAssessmentRepository, VendorAnswerRepository } from '../repositories/AssessmentRepository';
import { assertCanReadVendors, assertCanManageVendors, assertCanManageVendorDocs, assertCanRunAssessment, assertCanApproveAssessment } from '../policies/vendor.policies';
import { logEvent } from '../events/audit';
import { runInTenantContext, runInTenantReadContext } from '@/lib/db-context';
import { notFound, badRequest } from '@/lib/errors/types';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { CreateVendorSchema } from '@/lib/schemas';
import { computeAnswerPoints, computeAssessmentScore, scoreToRiskRating } from '../services/vendor-scoring';
import { bumpEntityCacheVersion } from '@/lib/cache/list-cache';

// Epic D.2 — preserve the three-state contract on update paths.
function sanitizeOptional(v: string | null | undefined): string | null | undefined {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return sanitizePlainText(v);
}

// Epic D.2 — list of free-text Vendor columns the loose-typed
// `updateVendor` patch may carry. Anything not in this list is left
// untouched (enums, foreign keys, dates, JSON, arrays of non-strings).
const FREE_TEXT_VENDOR_FIELDS = [
    'name',
    'legalName',
    'country',
    'domain',
    'websiteUrl',
    'description',
] as const;

// ─── Vendor CRUD ───

export async function listVendors(
    ctx: RequestContext,
    filters: VendorFilters = {},
    options: { take?: number } = {},
) {
    assertCanReadVendors(ctx);
    return runInTenantContext(ctx, (db) => VendorRepository.list(db, ctx, filters, options));
}

export async function listVendorsPaginated(ctx: RequestContext, params: VendorListParams) {
    assertCanReadVendors(ctx);
    return runInTenantContext(ctx, (db) => VendorRepository.listPaginated(db, ctx, params));
}

export async function getVendor(ctx: RequestContext, vendorId: string) {
    assertCanReadVendors(ctx);
    return runInTenantContext(ctx, async (db) => {
        const vendor = await VendorRepository.getById(db, ctx, vendorId);
        if (!vendor) throw notFound('Vendor not found');
        return vendor;
    });
}

export async function createVendor(ctx: RequestContext, input: z.infer<typeof CreateVendorSchema>) {
    assertCanManageVendors(ctx);
    // Epic D.2 — sanitise every free-text column. Enums + booleans +
    // FK ids pass through untouched.
    const sanitisedInput = {
        ...input,
        name: sanitizePlainText(input.name),
        legalName: input.legalName ? sanitizePlainText(input.legalName) : input.legalName,
        country: input.country ? sanitizePlainText(input.country) : input.country,
        domain: input.domain ? sanitizePlainText(input.domain) : input.domain,
        websiteUrl: input.websiteUrl ? sanitizePlainText(input.websiteUrl) : input.websiteUrl,
        description: input.description ? sanitizePlainText(input.description) : input.description,
        tags: input.tags?.map((t) => sanitizePlainText(t)),
    };
    const result = await runInTenantContext(ctx, async (db) => {
        const vendor = await VendorRepository.create(db, ctx, sanitisedInput);
        await logEvent(db, ctx, {
            action: 'VENDOR_CREATED',
            entityType: 'Vendor',
            entityId: vendor.id,
            details: `Vendor "${vendor.name}" created`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'Vendor', operation: 'created', after: { name: vendor.name, status: vendor.status, criticality: vendor.criticality }, summary: `Vendor "${vendor.name}" created` },
            metadata: { name: vendor.name, status: vendor.status, criticality: vendor.criticality },
        });
        return vendor;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

export async function updateVendor(ctx: RequestContext, vendorId: string, patch: Record<string, unknown>) {
    assertCanManageVendors(ctx);
    // Epic D.2 — sanitise the loose-typed patch one key at a time.
    // Enums, ids, dates, and structured JSON pass through unchanged
    // because they don't satisfy `typeof === 'string'`.
    const sanitisedPatch: Record<string, unknown> = { ...patch };
    for (const key of FREE_TEXT_VENDOR_FIELDS) {
        if (typeof sanitisedPatch[key] === 'string') {
            sanitisedPatch[key] = sanitizePlainText(sanitisedPatch[key] as string);
        }
    }
    if (Array.isArray(sanitisedPatch.tags)) {
        sanitisedPatch.tags = (sanitisedPatch.tags as unknown[]).map((t) =>
            typeof t === 'string' ? sanitizePlainText(t) : t,
        );
    }
    const result = await runInTenantContext(ctx, async (db) => {
        const previousStatus = patch.status ? (await VendorRepository.getById(db, ctx, vendorId))?.status : null;
        const vendor = await VendorRepository.update(db, ctx, vendorId, sanitisedPatch);
        if (!vendor) throw notFound('Vendor not found');

        const action = patch.status && patch.status !== previousStatus ? 'VENDOR_STATUS_CHANGED' : 'VENDOR_UPDATED';
        await logEvent(db, ctx, {
            action,
            entityType: 'Vendor',
            entityId: vendor.id,
            details: `Vendor "${vendor.name}" updated`,
            detailsJson: action === 'VENDOR_STATUS_CHANGED' ? { category: 'status_change', entityName: 'Vendor', fromStatus: previousStatus, toStatus: patch.status as string } : { category: 'entity_lifecycle', entityName: 'Vendor', operation: 'updated', changedFields: Object.keys(patch), summary: `Vendor "${vendor.name}" updated` },
            metadata: { fields: Object.keys(patch) },
        });
        return vendor;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

// ─── Vendor Documents ───

export async function listVendorDocuments(ctx: RequestContext, vendorId: string) {
    assertCanReadVendors(ctx);
    return runInTenantContext(ctx, (db) => VendorDocumentRepository.listByVendor(db, ctx, vendorId));
}

export async function addVendorDocument(ctx: RequestContext, vendorId: string, docInput: {
    type: string;
    title?: string | null;
    fileId?: string | null;
    externalUrl?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
    notes?: string | null;
    folder?: string | null;
}) {
    assertCanManageVendorDocs(ctx);
    // Epic D.2 — sanitise the free-text columns before persistence.
    // `notes` is encrypted at rest (manifest); sanitisation closes the
    // downstream-renderer integrity gap. `folder` is plain-text and
    // user-supplied so sanitised the same way.
    const sanitisedDoc = {
        ...docInput,
        title: sanitizeOptional(docInput.title) as string | null | undefined,
        externalUrl: sanitizeOptional(docInput.externalUrl) as string | null | undefined,
        notes: sanitizeOptional(docInput.notes) as string | null | undefined,
        folder: sanitizeOptional(docInput.folder) as string | null | undefined,
    };
    const result = await runInTenantContext(ctx, async (db) => {
        const doc = await VendorDocumentRepository.create(db, ctx, vendorId, sanitisedDoc);
        await logEvent(db, ctx, {
            action: 'VENDOR_DOCUMENT_ADDED',
            entityType: 'Vendor',
            entityId: vendorId,
            details: `Document "${doc.title || doc.type}" added to vendor`,
            detailsJson: { category: 'relationship', operation: 'linked', sourceEntity: 'Vendor', sourceId: vendorId, targetEntity: 'VendorDocument', targetId: doc.id, relation: doc.type },
            metadata: { docId: doc.id, type: doc.type },
        });
        return doc;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

export async function removeVendorDocument(ctx: RequestContext, docId: string) {
    assertCanManageVendorDocs(ctx);
    const result = await runInTenantContext(ctx, async (db) => {
        const doc = await VendorDocumentRepository.deleteById(db, ctx, docId);
        if (!doc) throw notFound('Document not found');
        await logEvent(db, ctx, {
            action: 'VENDOR_DOCUMENT_REMOVED',
            entityType: 'Vendor',
            entityId: doc.vendorId,
            details: `Document "${doc.title || doc.type}" removed`,
            detailsJson: { category: 'relationship', operation: 'unlinked', sourceEntity: 'Vendor', sourceId: doc.vendorId, targetEntity: 'VendorDocument', targetId: doc.id },
            metadata: { docId: doc.id },
        });
        return doc;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

// ─── Vendor Assessments ───

export async function startVendorAssessment(ctx: RequestContext, vendorId: string, templateKey: string) {
    assertCanRunAssessment(ctx);
    const result = await runInTenantContext(ctx, async (db) => {
        const template = await QuestionnaireRepository.getByKey(db, templateKey);
        if (!template) throw notFound(`Template "${templateKey}" not found`);

        const assessment = await VendorAssessmentRepository.create(db, ctx, vendorId, template.id);
        await logEvent(db, ctx, {
            action: 'VENDOR_ASSESSMENT_STARTED',
            entityType: 'Vendor',
            entityId: vendorId,
            details: `Assessment started with template "${template.name}"`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'VendorAssessment',
                operation: 'created',
                after: { assessmentId: assessment.id, templateKey, templateName: template.name },
                summary: `Assessment started with template "${template.name}"`,
            },
            metadata: { assessmentId: assessment.id, templateKey },
        });
        return assessment;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

export async function getVendorAssessment(ctx: RequestContext, assessmentId: string) {
    assertCanReadVendors(ctx);
    return runInTenantContext(ctx, async (db) => {
        const assessment = await VendorAssessmentRepository.getById(db, ctx, assessmentId);
        if (!assessment) throw notFound('Assessment not found');
        return assessment;
    });
}

export async function saveAssessmentAnswers(ctx: RequestContext, assessmentId: string, answers: { questionId: string; answerJson: unknown }[]) {
    assertCanRunAssessment(ctx);
    const result = await runInTenantContext(ctx, async (db) => {
        const assessment = await VendorAssessmentRepository.getById(db, ctx, assessmentId);
        if (!assessment) throw notFound('Assessment not found');
        if (assessment.status !== 'DRAFT') throw badRequest('Cannot edit answers on a non-draft assessment');

        // Load questions for point computation. Epic G-3 made
        // `template` (legacy QuestionnaireTemplate) nullable; the
        // existing approval-flow path always populates it, so a
        // null here means a G-3-instantiated assessment landed in
        // this legacy save path — reject loudly.
        if (!assessment.template) {
            throw badRequest(
                'Cannot save legacy answers on a G-3 assessment — use the response path instead.',
            );
        }
        const questionMap = new Map(assessment.template.questions.map(q => [q.id, q]));

        const enrichedAnswers = answers.map(a => {
            const q = questionMap.get(a.questionId);
            const points = q ? computeAnswerPoints(
                { id: q.id, weight: q.weight, riskPointsJson: q.riskPointsJson },
                { questionId: a.questionId, answerJson: a.answerJson }
            ) : 0;
            return { questionId: a.questionId, answerJson: a.answerJson, computedPoints: points };
        });

        const saved = await VendorAnswerRepository.upsertMany(db, ctx, assessmentId, enrichedAnswers);

        // Recalculate score
        const allAnswers = await VendorAnswerRepository.listByAssessment(db, ctx, assessmentId);
        const scoringQuestions = assessment.template.questions.map(q => ({
            id: q.id, weight: q.weight, riskPointsJson: q.riskPointsJson,
        }));
        const scoringAnswers = allAnswers.map(a => ({
            questionId: a.questionId, answerJson: a.answerJson,
        }));
        const { score, percentScore } = computeAssessmentScore(scoringQuestions, scoringAnswers);
        const riskRating = scoreToRiskRating(percentScore);
        await VendorAssessmentRepository.updateScore(db, assessmentId, score, riskRating);

        await logEvent(db, ctx, {
            action: 'VENDOR_ASSESSMENT_SCORED',
            entityType: 'Vendor',
            entityId: assessment.vendorId,
            details: `Assessment scored: ${score} (${riskRating})`,
            detailsJson: { category: 'custom', event: 'assessment_scored', assessmentId, score, percentScore, riskRating },
            metadata: { assessmentId, score, percentScore, riskRating },
        });

        return { saved: saved.length, score, riskRating };
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

export async function submitVendorAssessment(ctx: RequestContext, assessmentId: string) {
    assertCanRunAssessment(ctx);
    const result = await runInTenantContext(ctx, async (db) => {
        const assessment = await VendorAssessmentRepository.submit(db, ctx, assessmentId);
        if (!assessment) throw notFound('Assessment not found or not in DRAFT status');

        await logEvent(db, ctx, {
            action: 'VENDOR_ASSESSMENT_SUBMITTED',
            entityType: 'Vendor',
            entityId: assessment.vendorId,
            details: 'Assessment submitted for review',
            detailsJson: { category: 'status_change', entityName: 'VendorAssessment', fromStatus: 'DRAFT', toStatus: 'IN_REVIEW' },
            metadata: { assessmentId },
        });
        return assessment;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

export async function decideVendorAssessment(ctx: RequestContext, assessmentId: string, decision: string, notes?: string | null) {
    assertCanApproveAssessment(ctx);
    // Epic D.2 — `notes` is encrypted on `VendorAssessment.notes` and
    // also surfaces verbatim in the audit-log details string, so
    // sanitise once at the top of the path.
    const safeNotes = sanitizeOptional(notes);
    const result = await runInTenantContext(ctx, async (db) => {
        const assessment = await VendorAssessmentRepository.decide(db, ctx, assessmentId, decision, safeNotes ?? undefined);
        if (!assessment) throw notFound('Assessment not found or not in IN_REVIEW status');

        const action = decision === 'APPROVED' ? 'VENDOR_ASSESSMENT_APPROVED' : 'VENDOR_ASSESSMENT_REJECTED';
        await logEvent(db, ctx, {
            action,
            entityType: 'Vendor',
            entityId: assessment.vendorId,
            details: `Assessment ${decision.toLowerCase()}`,
            detailsJson: { category: 'status_change', entityName: 'VendorAssessment', fromStatus: 'IN_REVIEW', toStatus: decision, reason: notes || undefined },
            metadata: { assessmentId, decision, notes },
        });
        return assessment;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

// ─── Questionnaire Templates ───

export async function listQuestionnaireTemplates(ctx: RequestContext) {
    assertCanReadVendors(ctx);
    return runInTenantContext(ctx, (db) => QuestionnaireRepository.listTemplates(db));
}

export async function getQuestionnaireTemplate(ctx: RequestContext, templateKey: string) {
    assertCanReadVendors(ctx);
    return runInTenantContext(ctx, async (db) => {
        const template = await QuestionnaireRepository.getByKey(db, templateKey);
        if (!template) throw notFound('Template not found');
        return template;
    });
}

// ─── Vendor Review Dates ───

export async function setVendorReviewDates(ctx: RequestContext, vendorId: string, dates: { nextReviewAt?: string | null; contractRenewalAt?: string | null }) {
    assertCanManageVendors(ctx);
    const result = await runInTenantContext(ctx, async (db) => {
        const vendor = await VendorRepository.update(db, ctx, vendorId, dates);
        if (!vendor) throw notFound('Vendor not found');
        await logEvent(db, ctx, {
            action: 'VENDOR_UPDATED',
            entityType: 'Vendor',
            entityId: vendor.id,
            details: 'Vendor review dates updated',
            detailsJson: { category: 'entity_lifecycle', entityName: 'Vendor', operation: 'updated', changedFields: Object.keys(dates), after: dates, summary: 'Vendor review dates updated' },
            metadata: { nextReviewAt: dates.nextReviewAt, contractRenewalAt: dates.contractRenewalAt },
        });
        return vendor;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

// ─── Vendor Links ───

export async function listVendorLinks(ctx: RequestContext, vendorId: string) {
    assertCanReadVendors(ctx);
    return runInTenantContext(ctx, (db) => VendorLinkRepository.listByVendor(db, ctx, vendorId));
}

export async function addVendorLink(ctx: RequestContext, vendorId: string, data: {
    entityType: string;
    entityId: string;
    relation?: string;
}) {
    assertCanManageVendors(ctx);
    const result = await runInTenantContext(ctx, async (db) => {
        const link = await VendorLinkRepository.create(db, ctx, vendorId, data);
        await logEvent(db, ctx, {
            action: 'VENDOR_LINK_ADDED',
            entityType: 'Vendor',
            entityId: vendorId,
            details: `Linked ${data.entityType} ${data.entityId} as ${data.relation || 'RELATED'}`,
            detailsJson: { category: 'relationship', operation: 'linked', sourceEntity: 'Vendor', sourceId: vendorId, targetEntity: data.entityType, targetId: data.entityId, relation: data.relation || 'RELATED' },
            metadata: { linkId: link.id, entityType: data.entityType, entityId: data.entityId },
        });
        return link;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

export async function removeVendorLink(ctx: RequestContext, linkId: string) {
    assertCanManageVendors(ctx);
    const result = await runInTenantContext(ctx, async (db) => {
        const link = await VendorLinkRepository.deleteById(db, ctx, linkId);
        if (!link) throw notFound('Link not found');
        return link;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

// ─── Vendor Enrichment ───

import { getEnrichmentProvider } from '../services/vendor-enrichment';

export async function enrichVendor(ctx: RequestContext, vendorId: string) {
    assertCanManageVendors(ctx);
    const result = await runInTenantContext(ctx, async (db) => {
        const vendor = await db.vendor.findFirst({ where: { id: vendorId, tenantId: ctx.tenantId } });
        if (!vendor) throw notFound('Vendor not found');

        const domain = vendor.domain || (vendor.websiteUrl ? new URL(vendor.websiteUrl).hostname : null);
        if (!domain) throw badRequest('Vendor has no domain or website URL for enrichment');

        // Mark as pending
        await db.vendor.update({ where: { id: vendorId }, data: { enrichmentStatus: 'PENDING' } });

        try {
            const provider = getEnrichmentProvider();
            const result = await provider.enrich(domain);

            const updated = await db.vendor.update({
                where: { id: vendorId },
                data: {
                    ...(result.companyName && !vendor.legalName && { legalName: result.companyName }),
                    ...(result.country && !vendor.country && { country: result.country }),
                    ...(result.privacyPolicyUrl && { privacyPolicyUrl: result.privacyPolicyUrl }),
                    ...(result.securityPageUrl && { securityPageUrl: result.securityPageUrl }),
                    ...(result.certifications && { certificationsJson: result.certifications }),
                    ...(result.description && !vendor.description && { description: result.description }),
                    enrichmentLastRunAt: new Date(),
                    enrichmentStatus: 'SUCCESS',
                },
            });

            await logEvent(db, ctx, {
                action: 'VENDOR_ENRICHED',
                entityType: 'Vendor',
                entityId: vendorId,
                details: `Vendor enriched via ${provider.name}`,
                detailsJson: { category: 'custom', event: 'vendor_enriched', provider: provider.name, enrichedFields: Object.keys(result).filter(k => (result as Record<string, unknown>)[k]) },
                metadata: { provider: provider.name, fields: Object.keys(result).filter(k => (result as Record<string, unknown>)[k]) },
            });

            return updated;
        } catch (err: unknown) {
            await db.vendor.update({ where: { id: vendorId }, data: { enrichmentStatus: 'FAILED', enrichmentLastRunAt: new Date() } });
            throw err;
        }
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

// ─── Vendor Metrics (Dashboard) ───

export async function getVendorMetrics(ctx: RequestContext) {
    assertCanReadVendors(ctx);
    return runInTenantReadContext(ctx, async (db) => {
        const now = new Date();
        const in30 = new Date(now.getTime() + 30 * 86400000);

        const vendors = await db.vendor.findMany({
            where: { tenantId: ctx.tenantId },
            include: { assessments: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });

        const byCriticality: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        const byRiskRating: Record<string, number> = {};
        let overdueReview = 0;
        let upcomingReview = 0;
        let overdueRenewal = 0;
        let upcomingRenewal = 0;
        let highRiskNoAssessment = 0;

        for (const v of vendors) {
            byCriticality[v.criticality] = (byCriticality[v.criticality] || 0) + 1;
            byStatus[v.status] = (byStatus[v.status] || 0) + 1;

            const latestAssessment = v.assessments[0];
            if (latestAssessment?.riskRating) {
                byRiskRating[latestAssessment.riskRating] = (byRiskRating[latestAssessment.riskRating] || 0) + 1;
            }

            if (v.nextReviewAt && v.nextReviewAt < now) overdueReview++;
            else if (v.nextReviewAt && v.nextReviewAt <= in30) upcomingReview++;

            if (v.contractRenewalAt && v.contractRenewalAt < now) overdueRenewal++;
            else if (v.contractRenewalAt && v.contractRenewalAt <= in30) upcomingRenewal++;

            if (['HIGH', 'CRITICAL'].includes(v.criticality) && (!latestAssessment || latestAssessment.status !== 'APPROVED')) {
                highRiskNoAssessment++;
            }
        }

        // Expiring docs in 30 days
        const expiringDocs = await db.vendorDocument.count({
            where: { tenantId: ctx.tenantId, validTo: { gte: now, lte: in30 } },
        });

        // ── Continuous-monitoring signals ──
        // Vendors whose parsed SOC 2 / cert attestation has already expired
        // (distinct vendors with a dated report period in the past).
        const expiredAttestationRows = await db.vendorDocExtraction.findMany({
            where: { tenantId: ctx.tenantId, auditPeriodEnd: { lt: now } },
            select: { vendorId: true },
            distinct: ['vendorId'],
            take: 5000,
        });
        // Vendors with a breach detected by the monitor in the last 90 days.
        const in90ago = new Date(now.getTime() - 90 * 86400000);
        const recentBreachRows = await db.vendorPostureEvent.findMany({
            where: { tenantId: ctx.tenantId, eventType: 'BREACH_DETECTED', occurredAt: { gte: in90ago } },
            select: { vendorId: true },
            distinct: ['vendorId'],
            take: 5000,
        });

        return {
            totalVendors: vendors.length,
            byCriticality,
            byStatus,
            byRiskRating,
            overdueReview,
            upcomingReview,
            overdueRenewal,
            upcomingRenewal,
            highRiskNoAssessment,
            expiringDocuments: expiringDocs,
            // Continuous-monitoring dashboard signals.
            expiredAttestations: expiredAttestationRows.length,
            recentBreachActivity: recentBreachRows.length,
            overdueReassessment: overdueReview,
        };
    });
}

// ─── Workflow: Status with Approval Gate ───

export async function updateVendorStatusWithGate(ctx: RequestContext, vendorId: string, newStatus: string) {
    assertCanManageVendors(ctx);
    const result = await runInTenantContext(ctx, async (db) => {
        const vendor = await db.vendor.findFirst({
            where: { id: vendorId, tenantId: ctx.tenantId },
            include: { assessments: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });
        if (!vendor) throw notFound('Vendor not found');

        // Gate: cannot go ACTIVE without approved assessment
        if (newStatus === 'ACTIVE' && vendor.status !== 'ACTIVE') {
            const latestAssessment = vendor.assessments[0];
            if (!latestAssessment || latestAssessment.status !== 'APPROVED') {
                throw badRequest('Cannot activate vendor without an approved assessment. Complete and approve an assessment first.');
            }
        }

        const updated = await db.vendor.update({ where: { id: vendorId }, data: { status: newStatus as VendorStatus } });

        await logEvent(db, ctx, {
            action: 'VENDOR_STATUS_CHANGED',
            entityType: 'Vendor',
            entityId: vendorId,
            details: `Vendor status changed from ${vendor.status} to ${newStatus}`,
            detailsJson: { category: 'status_change', entityName: 'Vendor', fromStatus: vendor.status, toStatus: newStatus },
            metadata: { from: vendor.status, to: newStatus },
        });

        return updated;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return result;
}

// ─── Bulk actions (canonical BulkActionBar rollout) ───

export async function bulkSetVendorStatus(
    ctx: RequestContext,
    vendorIds: string[],
    status: 'ACTIVE' | 'ONBOARDING' | 'OFFBOARDING' | 'OFFBOARDED',
) {
    assertCanManageVendors(ctx);
    const updated = await runInTenantContext(ctx, async (db) => {
        const rows = await VendorRepository.listByIds(db, ctx, vendorIds);
        if (rows.length === 0) return 0;
        await VendorRepository.bulkUpdate(db, ctx, vendorIds, { status });
        for (const r of rows) {
            await logEvent(db, ctx, {
                action: 'VENDOR_STATUS_CHANGED',
                entityType: 'Vendor',
                entityId: r.id,
                details: `Vendor "${r.name}" status set to ${status}`,
                detailsJson: {
                    category: 'status_change',
                    entityName: 'Vendor',
                    fromStatus: r.status,
                    toStatus: status,
                },
            });
        }
        return rows.length;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return { updated };
}

/** Bulk soft-delete vendors selected in the table action bar. */
export async function bulkDeleteVendor(ctx: RequestContext, vendorIds: string[]) {
    assertCanManageVendors(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rows = await VendorRepository.listByIds(db, ctx, vendorIds);
        if (rows.length === 0) return { deleted: 0 };
        await db.vendor.deleteMany({ where: { id: { in: rows.map((r) => r.id) }, tenantId: ctx.tenantId } });
        for (const r of rows) {
            await logEvent(db, ctx, {
                action: 'SOFT_DELETE',
                entityType: 'Vendor',
                entityId: r.id,
                details: 'Vendor soft-deleted (bulk)',
                detailsJson: { category: 'entity_lifecycle', entityName: 'Vendor', operation: 'deleted', summary: 'Vendor soft-deleted' },
            });
        }
        return { deleted: rows.length };
    });
}

export async function bulkAssignVendor(
    ctx: RequestContext,
    vendorIds: string[],
    ownerUserId: string | null,
) {
    assertCanManageVendors(ctx);
    const updated = await runInTenantContext(ctx, async (db) => {
        const rows = await VendorRepository.listByIds(db, ctx, vendorIds);
        if (rows.length === 0) return 0;
        await VendorRepository.bulkUpdate(db, ctx, vendorIds, {
            ownerUserId: ownerUserId || null,
        });
        for (const r of rows) {
            await logEvent(db, ctx, {
                action: 'VENDOR_UPDATED',
                entityType: 'Vendor',
                entityId: r.id,
                details: ownerUserId
                    ? `Vendor "${r.name}" owner reassigned`
                    : `Vendor "${r.name}" owner cleared`,
                detailsJson: {
                    category: 'entity_lifecycle',
                    entityName: 'Vendor',
                    operation: 'updated',
                    changedFields: ['ownerUserId'],
                    after: { ownerUserId: ownerUserId || null },
                    summary: ownerUserId ? `owner reassigned (bulk)` : `owner cleared (bulk)`,
                },
            });
        }
        return rows.length;
    });
    await bumpEntityCacheVersion(ctx, 'vendor');
    return { updated };
}

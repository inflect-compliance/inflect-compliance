/**
 * Vendor-document → assessment pre-fill (propose-not-commit).
 *
 * Flow: parse the document to text → SANITIZE (privacy boundary) → AI
 * extract into a Zod-validated structure → map extracted controls to the
 * assessment's questions → PROPOSE cited answers a human reviews. Approving
 * a proposal is the ONLY path that writes a real VendorAssessmentAnswer —
 * an AI mis-reading a SOC 2 into a scored compliance record is a real risk,
 * so nothing is committed silently. Every proposal cites its source control
 * + result + period so a reviewer can verify the AI didn't hallucinate.
 *
 * Mirrors the RiskSuggestionSession/Item propose pattern.
 */
import { z } from 'zod';
import { RequestContext } from '../types';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { badRequest, notFound } from '@/lib/errors/types';
import { logEvent } from '../events/audit';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { createFinding } from './finding';
import { sanitizeDocText, extractDocument, type DocExtraction } from '@/app-layer/ai/vendor-doc';
import { getFileRecordText } from '@/app-layer/services/vendor-doc-text';
import { controlEvidencesQuestion } from '@/app-layer/services/soc2-question-map';
import type { FindingSeverity } from '@prisma/client';

/** Finding provenance tag for materialised SOC 2 exceptions. */
export const VENDOR_DOC_EXCEPTION_KIND = 'VENDOR_DOC_EXCEPTION';

export const ExtractVendorDocSchema = z.object({
    documentId: z.string().min(1),
    /** Optional target assessment to pre-fill. */
    assessmentId: z.string().optional(),
    /** Pre-extracted text override (skips the PDF fetch — used by tests/callers). */
    text: z.string().max(500_000).optional(),
    /** Opt-in: SOC 2 exceptions propose vendor findings. */
    materializeExceptions: z.boolean().default(false),
});
export type ExtractVendorDocInput = z.input<typeof ExtractVendorDocSchema>;

function fmtPeriod(e: DocExtraction): string {
    if (!e.auditPeriodStart && !e.auditPeriodEnd) return 'period n/a';
    return `period ${e.auditPeriodStart ?? '?'}..${e.auditPeriodEnd ?? '?'}`;
}

export interface ExtractResult {
    extractionId: string;
    status: string;
    reportType: string | null;
    proposalsCreated: number;
    findingsProposed: number;
}

export async function extractVendorDocument(
    ctx: RequestContext,
    rawInput: ExtractVendorDocInput,
): Promise<ExtractResult> {
    assertCanWrite(ctx);
    const input = ExtractVendorDocSchema.parse(rawInput);

    // ── Resolve text (OUTSIDE the tenant tx), sanitize, extract. ──
    const { document, rawText } = await runInTenantContext(ctx, async (db) => {
        const doc = await db.vendorDocument.findFirst({
            where: { id: input.documentId, tenantId: ctx.tenantId },
            select: { id: true, vendorId: true, fileId: true },
        });
        if (!doc) throw notFound('Vendor document not found');
        let text = input.text ?? null;
        if (!text && doc.fileId) {
            text = await getFileRecordText(db, ctx.tenantId, doc.fileId);
        }
        return { document: doc, rawText: text ?? '' };
    });

    const sanitized = sanitizeDocText(rawText);
    const extraction = await extractDocument(sanitized);
    const e = extraction.data;

    // ── Persist the extraction session. ──
    const extractionRow = await runInTenantContext(ctx, async (db) => {
        return db.vendorDocExtraction.create({
            data: {
                tenantId: ctx.tenantId,
                vendorId: document.vendorId,
                documentId: document.id,
                assessmentId: input.assessmentId ?? null,
                status: extraction.ok ? 'EXTRACTED' : 'FAILED',
                provider: extraction.provider,
                modelName: extraction.model,
                reportType: e.reportType,
                auditPeriodStart: e.auditPeriodStart ? new Date(e.auditPeriodStart) : null,
                auditPeriodEnd: e.auditPeriodEnd ? new Date(e.auditPeriodEnd) : null,
                scope: e.scope ? sanitizePlainText(e.scope) : null,
                auditor: e.auditor ? sanitizePlainText(e.auditor) : null,
                extractionJson: e as object,
                errorMessage: extraction.error ?? null,
                createdByUserId: ctx.userId,
            },
        });
    });

    // ── Map controls → questions → PROPOSE cited answers. ──
    let proposalsCreated = 0;
    if (input.assessmentId && e.controls.length > 0) {
        proposalsCreated = await runInTenantContext(ctx, async (db) => {
            const assessment = await db.vendorAssessment.findFirst({
                where: { id: input.assessmentId!, tenantId: ctx.tenantId },
                select: { id: true, templateId: true },
            });
            // The legacy QuestionnaireQuestion set (what VendorAssessmentAnswer
            // references). Assessments on a G-3 template version pre-fill via a
            // follow-up; here we map against the template's questions.
            if (!assessment?.templateId) return 0;
            const questionList = await db.questionnaireQuestion.findMany({
                where: { templateId: assessment.templateId },
                select: { id: true, prompt: true },
                take: 500,
            });

            let created = 0;
            for (const q of questionList) {
                const matched = e.controls.filter((c) => controlEvidencesQuestion(c.ref, q.prompt));
                if (matched.length === 0) continue;
                const hasException = matched.some((c) => c.result === 'EXCEPTION');
                const refs = matched.map((c) => c.ref).join(', ');
                const citation = `SOC 2 ${refs} — ${hasException ? 'exception noted' : 'no exceptions'}, ${fmtPeriod(e)}`;
                await db.vendorAnswerProposal.create({
                    data: {
                        tenantId: ctx.tenantId,
                        extractionId: extractionRow.id,
                        assessmentId: assessment.id,
                        questionId: q.id,
                        proposedAnswerJson: { value: hasException ? 'PARTIAL' : 'YES', controls: matched.map((c) => c.ref), source: citation },
                        confidence: hasException ? 'medium' : 'high',
                        sourceCitation: citation,
                        status: 'PENDING',
                    },
                });
                created++;
            }
            return created;
        });
    }

    // ── Exceptions → PROPOSED vendor findings (opt-in, idempotent). ──
    let findingsProposed = 0;
    if (input.materializeExceptions && e.exceptions.length > 0) {
        const existing = await runInTenantContext(ctx, async (db) =>
            db.finding.findMany({
                where: { tenantId: ctx.tenantId, sourceKind: VENDOR_DOC_EXCEPTION_KIND, deletedAt: null },
                select: { sourceRef: true },
                take: 2000,
            }),
        );
        const seen = new Set(existing.map((f) => f.sourceRef).filter(Boolean));
        for (const exc of e.exceptions.slice(0, 100)) {
            const sourceRef = `${extractionRow.id}:${exc.control}`;
            if (seen.has(sourceRef)) continue;
            await createFinding(ctx, {
                severity: 'MEDIUM' as FindingSeverity,
                type: 'OBSERVATION',
                title: `Vendor SOC 2 exception — ${exc.control}`.slice(0, 250),
                description: exc.description,
                sourceKind: VENDOR_DOC_EXCEPTION_KIND,
                sourceRef,
            });
            findingsProposed++;
        }
    }

    await runInTenantContext(ctx, async (db) => {
        await logEvent(db, ctx, {
            action: 'VENDOR_DOC_EXTRACTED',
            entityType: 'VendorDocExtraction',
            entityId: extractionRow.id,
            details: `Extracted ${e.reportType} for vendor ${document.vendorId} — ${proposalsCreated} proposed answers, ${findingsProposed} proposed findings`,
            detailsJson: { category: 'custom', event: 'vendor_doc_extracted' },
            metadata: { vendorId: document.vendorId, reportType: e.reportType, proposalsCreated, findingsProposed },
        });
    });

    return {
        extractionId: extractionRow.id,
        status: extraction.ok ? 'EXTRACTED' : 'FAILED',
        reportType: e.reportType,
        proposalsCreated,
        findingsProposed,
    };
}

/**
 * Approve a proposal → MATERIALISE a real VendorAssessmentAnswer (the only
 * path that commits an AI-proposed answer). Optionally accept an edited
 * answer payload from the reviewer.
 */
export async function approveProposal(
    ctx: RequestContext,
    proposalId: string,
    editedAnswerJson?: unknown,
) {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const proposal = await db.vendorAnswerProposal.findFirst({
            where: { id: proposalId, tenantId: ctx.tenantId },
        });
        if (!proposal) throw notFound('Proposal not found');
        if (!proposal.assessmentId || !proposal.questionId) {
            throw badRequest('UNMAPPED_PROPOSAL', 'Proposal is not mapped to an assessment question');
        }
        const answer = await db.vendorAssessmentAnswer.upsert({
            where: { assessmentId_questionId: { assessmentId: proposal.assessmentId, questionId: proposal.questionId } },
            create: {
                tenantId: ctx.tenantId,
                assessmentId: proposal.assessmentId,
                questionId: proposal.questionId,
                answerJson: (editedAnswerJson ?? proposal.proposedAnswerJson) as object,
                reviewerNotes: `Pre-filled from ${proposal.sourceCitation}`,
            },
            update: {
                answerJson: (editedAnswerJson ?? proposal.proposedAnswerJson) as object,
                reviewerNotes: `Pre-filled from ${proposal.sourceCitation}`,
            },
        });
        await db.vendorAnswerProposal.update({
            where: { id: proposalId },
            data: { status: 'ACCEPTED', createdAnswerId: answer.id },
        });
        await logEvent(db, ctx, {
            action: 'VENDOR_PROPOSAL_APPROVED',
            entityType: 'VendorAnswerProposal',
            entityId: proposalId,
            details: `Approved proposed answer (${proposal.sourceCitation}) → answer ${answer.id}`,
            detailsJson: { category: 'custom', event: 'vendor_proposal_approved' },
        });
        return { answerId: answer.id };
    });
}

/** Reject a proposal — no answer is written. */
export async function rejectProposal(ctx: RequestContext, proposalId: string) {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const proposal = await db.vendorAnswerProposal.findFirst({
            where: { id: proposalId, tenantId: ctx.tenantId },
            select: { id: true },
        });
        if (!proposal) throw notFound('Proposal not found');
        await db.vendorAnswerProposal.update({ where: { id: proposalId }, data: { status: 'REJECTED' } });
        return { id: proposalId };
    });
}

/** Recent extractions for a vendor. */
export async function listVendorDocExtractions(ctx: RequestContext, vendorId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        return db.vendorDocExtraction.findMany({
            where: { tenantId: ctx.tenantId, vendorId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    });
}

/** An extraction + its pending proposals (the review surface data). */
export async function getVendorDocExtraction(ctx: RequestContext, extractionId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const extraction = await db.vendorDocExtraction.findFirst({
            where: { id: extractionId, tenantId: ctx.tenantId },
        });
        if (!extraction) throw notFound('Extraction not found');
        const proposals = await db.vendorAnswerProposal.findMany({
            where: { tenantId: ctx.tenantId, extractionId },
            orderBy: { createdAt: 'asc' },
            take: 500,
        });
        return { ...extraction, proposals };
    });
}

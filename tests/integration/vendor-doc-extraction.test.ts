/**
 * Vendor-doc extraction (integration) — the propose-not-commit contract
 * against a real DB with RLS live:
 *   - extractVendorDocument persists an extraction and (with the stub AI,
 *     no key) writes NO VendorAssessmentAnswer;
 *   - approving a proposal is the ONLY path that materialises a real answer;
 *   - rejecting a proposal writes nothing.
 */
import * as dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import type { PrismaClient } from '@prisma/client';
import { createTenantWithDek } from '@/lib/security/tenant-key-manager';
import { getPermissionsForRole } from '@/lib/permissions';
import type { RequestContext } from '@/app-layer/types';
import {
    extractVendorDocument,
    approveProposal,
    rejectProposal,
} from '@/app-layer/usecases/vendor-doc-extraction';

jest.setTimeout(30_000);
const describeFn = DB_AVAILABLE ? describe : describe.skip;

function ctxFor(tenantId: string, userId: string): RequestContext {
    return {
        requestId: `vdoc-${Date.now()}`,
        userId,
        tenantId,
        role: 'ADMIN',
        permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: true },
        appPermissions: getPermissionsForRole('ADMIN'),
    };
}

describeFn('vendor-doc extraction (integration)', () => {
    let prisma: PrismaClient;
    let tenantId: string;
    let userId: string;
    let ctx: RequestContext;
    let vendorId: string;
    let documentId: string;
    let assessmentId: string;
    let questionId: string;

    beforeAll(async () => {
        prisma = prismaTestClient();
        await prisma.$connect();
        const suffix = `vdoc-${Date.now()}`;
        const tenant = await createTenantWithDek({ name: 'VDoc Co', slug: suffix });
        tenantId = tenant.id;
        const user = await prisma.user.create({ data: { email: `u-${suffix}@example.com`, name: 'Reviewer' } });
        userId = user.id;
        ctx = ctxFor(tenantId, userId);

        vendorId = (await prisma.vendor.create({ data: { tenantId, name: `Acme ${suffix}` } })).id;
        documentId = (
            await prisma.vendorDocument.create({
                data: { tenantId, vendorId, type: 'SOC2', title: 'SOC 2 Type II', uploadedByUserId: userId },
            })
        ).id;
        const template = await prisma.questionnaireTemplate.create({ data: { key: `tpl-${suffix}`, name: 'Security' } });
        questionId = (
            await prisma.questionnaireQuestion.create({
                data: { templateId: template.id, section: 'Security', prompt: 'Do you enforce access control?', answerType: 'YES_NO' },
            })
        ).id;
        assessmentId = (
            await prisma.vendorAssessment.create({
                data: { tenantId, vendorId, templateId: template.id, requestedByUserId: userId },
            })
        ).id;
    });

    afterAll(async () => {
        try {
            await prisma.vendorAnswerProposal.deleteMany({ where: { tenantId } });
            await prisma.vendorDocExtraction.deleteMany({ where: { tenantId } });
            await prisma.vendorAssessmentAnswer.deleteMany({ where: { tenantId } });
        } catch {
            /* best-effort */
        }
    });

    it('extract persists an extraction and writes NO assessment answer (stub AI)', async () => {
        const res = await extractVendorDocument(ctx, {
            documentId,
            assessmentId,
            text: 'SOC 2 Type II report. Controls CC6.1 access control operating effectively.',
        });
        expect(res.extractionId).toBeTruthy();
        expect(res.status).toBe('EXTRACTED');
        // Stub AI extracts nothing → no proposals, and CRUCIALLY no answer.
        const answers = await prisma.vendorAssessmentAnswer.count({ where: { tenantId, assessmentId } });
        expect(answers).toBe(0);
    });

    it('approving a proposal is the ONLY path that materialises an answer', async () => {
        const extraction = await prisma.vendorDocExtraction.create({
            data: { tenantId, vendorId, documentId, assessmentId, status: 'EXTRACTED', createdByUserId: userId },
        });
        const proposal = await prisma.vendorAnswerProposal.create({
            data: {
                tenantId,
                extractionId: extraction.id,
                assessmentId,
                questionId,
                proposedAnswerJson: { value: 'YES', controls: ['CC6.1'] },
                confidence: 'high',
                sourceCitation: 'SOC 2 CC6.1 — no exceptions, period 2025..2026',
                status: 'PENDING',
            },
        });

        // Before approval: no answer exists.
        expect(await prisma.vendorAssessmentAnswer.count({ where: { tenantId, assessmentId } })).toBe(0);

        const { answerId } = await approveProposal(ctx, proposal.id);
        expect(answerId).toBeTruthy();

        const answer = await prisma.vendorAssessmentAnswer.findFirst({ where: { id: answerId } });
        expect(answer).not.toBeNull();
        expect(answer!.questionId).toBe(questionId);
        const updatedProposal = await prisma.vendorAnswerProposal.findFirst({ where: { id: proposal.id } });
        expect(updatedProposal!.status).toBe('ACCEPTED');
        expect(updatedProposal!.createdAnswerId).toBe(answerId);
    });

    it('rejecting a proposal writes no answer', async () => {
        const extraction = await prisma.vendorDocExtraction.create({
            data: { tenantId, vendorId, documentId, status: 'EXTRACTED', createdByUserId: userId },
        });
        const proposal = await prisma.vendorAnswerProposal.create({
            data: {
                tenantId,
                extractionId: extraction.id,
                assessmentId,
                questionId,
                proposedAnswerJson: { value: 'YES' },
                sourceCitation: 'SOC 2 CC7.2',
                status: 'PENDING',
            },
        });
        await rejectProposal(ctx, proposal.id);
        const updated = await prisma.vendorAnswerProposal.findFirst({ where: { id: proposal.id } });
        expect(updated!.status).toBe('REJECTED');
        expect(updated!.createdAnswerId).toBeNull();
    });
});

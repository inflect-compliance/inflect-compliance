/**
 * Test Evidence Link repository — link/unlink evidence to ControlTestRun.
 */
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export const TestEvidenceRepository = {
    async link(db: PrismaTx, ctx: RequestContext, data: {
        testRunId: string;
        kind: 'FILE' | 'EVIDENCE' | 'LINK' | 'INTEGRATION_RESULT';
        fileId?: string | null;
        evidenceId?: string | null;
        url?: string | null;
        integrationResultId?: string | null;
        note?: string | null;
        // PR-R — SHA-256 of the linked file's bytes, frozen at link time, so
        // verifyRunEvidence can recompute from storage and detect tampering.
        sha256Hash?: string | null;
    }) {
        return db.controlTestEvidenceLink.create({
            data: {
                tenantId: ctx.tenantId,
                testRunId: data.testRunId,
                kind: data.kind,
                fileId: data.fileId ?? null,
                evidenceId: data.evidenceId ?? null,
                url: data.url ?? null,
                integrationResultId: data.integrationResultId ?? null,
                note: data.note ?? null,
                sha256Hash: data.sha256Hash ?? null,
                createdByUserId: ctx.userId,
            },
        });
    },

    async unlink(db: PrismaTx, ctx: RequestContext, linkId: string) {
        return db.controlTestEvidenceLink.deleteMany({
            where: { id: linkId, tenantId: ctx.tenantId },
        });
    },

    async listByRun(db: PrismaTx, ctx: RequestContext, testRunId: string) {
        return db.controlTestEvidenceLink.findMany({
            where: { tenantId: ctx.tenantId, testRunId },
            include: {
                evidence: { select: { id: true, title: true, type: true } },
                createdBy: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    },
};

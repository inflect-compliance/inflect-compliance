/**
 * Trust-center gated-document admin (PR-8) — tenant-scoped management of
 * documents + access requests. Public visitor flows (request + download) live
 * in the isolated `@/lib/trust-center/gated` module.
 */
import crypto from 'crypto';
import { z } from 'zod';
import { RequestContext } from '../types';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { badRequest, notFound } from '@/lib/errors/types';
import { logEvent } from '../events/audit';
import { sanitizePlainText } from '@/lib/security/sanitize';

const DOWNLOAD_TOKEN_TTL_DAYS = 7;
const hashToken = (t: string) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

export const AddDocumentSchema = z.object({ label: z.string().min(1).max(200), fileRecordId: z.string().min(1), gated: z.boolean().default(true) });

export async function addTrustCenterDocument(ctx: RequestContext, input: z.infer<typeof AddDocumentSchema>) {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const tc = await db.trustCenter.findFirst({ where: { tenantId: ctx.tenantId }, select: { id: true } });
        if (!tc) throw badRequest('Create the trust center before adding documents.');
        const file = await db.fileRecord.findFirst({ where: { id: input.fileRecordId, tenantId: ctx.tenantId }, select: { id: true } });
        if (!file) throw badRequest('Unknown file.');
        const doc = await db.trustCenterDocument.create({
            data: { tenantId: ctx.tenantId, trustCenterId: tc.id, label: sanitizePlainText(input.label), fileRecordId: input.fileRecordId, gated: input.gated },
        });
        await logEvent(db, ctx, { action: 'CREATE', entityType: 'TrustCenterDocument', entityId: doc.id, details: `Added trust-center document: ${doc.label}`, detailsJson: { category: 'entity_lifecycle', entityName: 'TrustCenterDocument', operation: 'created', after: { label: doc.label, gated: doc.gated }, summary: `Added trust-center document: ${doc.label}` } });
        return doc;
    });
}

export async function listTrustCenterDocuments(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.trustCenterDocument.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, label: true, gated: true, fileRecordId: true, createdAt: true }, orderBy: { label: 'asc' }, take: 200 }),
    );
}

export async function listTrustCenterAccessRequests(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.trustCenterAccessRequest.findMany({
            where: { tenantId: ctx.tenantId },
            // downloadTokenHash intentionally omitted (credential).
            select: { id: true, requesterName: true, requesterEmail: true, company: true, status: true, ndaSignedAt: true, grantedAt: true, expiresAt: true, downloadedAt: true, createdAt: true, document: { select: { label: true } } },
            orderBy: { createdAt: 'desc' },
            take: 500,
        }),
    );
}

export interface ApproveResult {
    requestId: string;
    downloadToken: string;
}

/** Manually approve a REQUESTED access request → issue a single-use expiring token. */
export async function approveTrustCenterAccessRequest(ctx: RequestContext, requestId: string, now: Date = new Date()): Promise<ApproveResult> {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const req = await db.trustCenterAccessRequest.findFirst({ where: { id: requestId, tenantId: ctx.tenantId }, select: { id: true, status: true } });
        if (!req) throw notFound('Access request not found.');
        if (req.status === 'APPROVED') throw badRequest('Already approved.');
        const downloadToken = `ictc_${crypto.randomBytes(24).toString('hex')}`;
        await db.trustCenterAccessRequest.updateMany({
            where: { id: requestId, tenantId: ctx.tenantId },
            data: { status: 'APPROVED', grantedAt: now, expiresAt: new Date(now.getTime() + DOWNLOAD_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000), downloadTokenHash: hashToken(downloadToken), downloadedAt: null },
        });
        await logEvent(db, ctx, { action: 'UPDATE', entityType: 'TrustCenterAccessRequest', entityId: requestId, details: 'Approved trust-center access request', detailsJson: { category: 'access', entityName: 'TrustCenterAccessRequest', operation: 'approved', summary: 'Approved gated-document access request' } });
        return { requestId, downloadToken };
    });
}

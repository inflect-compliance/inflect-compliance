/**
 * GET /api/t/[tenantSlug]/policies/[id]/export
 *
 * B9 — Policy document export. Streams the policy as a fully
 * branded PDF carrying:
 *   • A front cover with the brand wordmark + classification chip
 *     + provenance row (version + effective date + next review).
 *   • A clickable Table of Contents.
 *   • Body sections with explicit page breaks.
 *   • The shared per-page header + footer chrome.
 *
 * Plan check: PDF exports require `PDF_EXPORTS` (TRIAL+). Match the
 * surface of `/api/t/.../reports/pdf/generate`.
 *
 * Auth: `assertCanRead` inside `generatePolicyDocumentPdf` — the
 * policy detail page is read-gated, so anyone who can view a
 * policy can export it.
 *
 * Query string:
 *   `classification` — one of PUBLIC | INTERNAL | CONFIDENTIAL |
 *   RESTRICTED. Defaults to INTERNAL. Drives the cover chip + the
 *   per-page footer suffix.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { generatePolicyDocumentPdf } from '@/app-layer/reports/pdf/policyDocument';
import type { PolicyClassification } from '@/lib/pdf/policyLayout';
import { FEATURES } from '@/lib/entitlements';
import { requireFeature } from '@/lib/entitlements-server';
import { logEvent } from '@/app-layer/events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { logger } from '@/lib/observability/logger';

// Force Node.js runtime — PDFKit needs stream/zlib/Buffer.
export const runtime = 'nodejs';
export const maxDuration = 60;

function collectPdfBuffer(pdfDoc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
        pdfDoc.end();
    });
}

const VALID_CLASSIFICATIONS: ReadonlyArray<PolicyClassification> = [
    'PUBLIC',
    'INTERNAL',
    'CONFIDENTIAL',
    'RESTRICTED',
];

function parseClassification(raw: string | null): PolicyClassification {
    if (!raw) return 'INTERNAL';
    const upper = raw.toUpperCase();
    return (VALID_CLASSIFICATIONS as ReadonlyArray<string>).includes(upper)
        ? (upper as PolicyClassification)
        : 'INTERNAL';
}

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);

        await requireFeature(ctx.tenantId, FEATURES.PDF_EXPORTS);

        const url = new URL(req.url);
        const classification = parseClassification(
            url.searchParams.get('classification'),
        );

        let pdfDoc: PDFKit.PDFDocument;
        try {
            pdfDoc = await generatePolicyDocumentPdf(ctx, params.id, {
                classification,
            });
        } catch (err) {
            logger.error('Policy PDF generation failed', {
                component: 'report',
                policyId: params.id,
            });
            throw err;
        }

        const pdfBuffer = await collectPdfBuffer(pdfDoc);
        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `policy_${params.id}_${dateStr}.pdf`;

        // Audit trail — every policy export is logged.
        await runInTenantContext(ctx, (db) =>
            logEvent(db, ctx, {
                action: 'POLICY_EXPORTED',
                entityType: 'Policy',
                entityId: params.id,
                details: JSON.stringify({
                    classification,
                    sizeBytes: pdfBuffer.length,
                }),
                detailsJson: {
                    category: 'document',
                    entityName: 'Policy',
                    operation: 'exported',
                    after: { format: 'pdf', classification },
                    summary: `Policy exported (${classification})`,
                },
            }),
        );

        return new Response(new Uint8Array(pdfBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'no-store',
            },
        });
    },
);

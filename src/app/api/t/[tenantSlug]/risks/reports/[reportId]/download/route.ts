import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getReport } from '@/app-layer/usecases/risk-report';
import { getStorageProvider } from '@/lib/storage';
import { withApiErrorHandling } from '@/lib/errors/api';
import { badRequest } from '@/lib/errors/types';

/** RQ-10 — download a generated report's file. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; reportId: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const run = await getReport(ctx, params.reportId);
        if (run.status !== 'COMPLETED' || !run.outputPath) throw badRequest('Report is not ready for download');
        const stream = getStorageProvider().readStream(run.outputPath);
        const chunks: Buffer[] = [];
        for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
        const buf = Buffer.concat(chunks);
        const mime = run.format === 'CSV' ? 'text/csv' : 'application/pdf';
        return new NextResponse(buf as unknown as BodyInit, {
            headers: { 'Content-Type': mime, 'Content-Disposition': `attachment; filename="report-${run.id}.${run.format.toLowerCase()}"` },
        });
    },
);

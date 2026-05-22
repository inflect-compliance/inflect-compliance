import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { downloadFile } from '@/app-layer/usecases/file';
import { withApiErrorHandling } from '@/lib/errors/api';
import { badRequest } from '@/lib/errors/types';

export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; fileName: string }> }
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);

    if (!params.fileName) {
        throw badRequest('Missing fileName');
    }

    const fileData = await downloadFile(ctx, params.fileName);

    return new NextResponse(fileData.buffer as unknown as BodyInit, {
        status: 200,
        headers: {
            'Content-Type': fileData.mimeType,
            'Content-Disposition': `inline; filename="${fileData.name}"`,
        },
    });
});

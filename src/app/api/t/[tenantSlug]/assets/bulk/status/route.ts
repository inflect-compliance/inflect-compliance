import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkSetAssetStatus } from '@/app-layer/usecases/asset';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkAssetStatusSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkAssetStatusSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkSetAssetStatus(ctx, body.assetIds, body.status);
            return jsonResponse(result);
        },
    ),
);

import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkAssignAsset } from '@/app-layer/usecases/asset';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkAssetAssignSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkAssetAssignSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkAssignAsset(ctx, body.assetIds, body.ownerUserId);
            return jsonResponse(result);
        },
    ),
);

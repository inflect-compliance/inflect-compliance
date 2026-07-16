import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkImportAssets } from '@/app-layer/usecases/asset';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkImportAssetsSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Bulk asset import — replaces the CSV importer's N sequential per-row POSTs
 * with a single request. The usecase dedupes by name and resolves free-text
 * owners to members; the response reports created / skipped / per-row errors.
 */
export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkImportAssetsSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkImportAssets(ctx, body.assets);
            return jsonResponse(result);
        },
    ),
);

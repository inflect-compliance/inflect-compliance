import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkImportRisks } from '@/app-layer/usecases/risk';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkImportRisksSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Bulk risk import — replaces the CSV importer's N sequential per-row POSTs
 * with a single request. The usecase dedupes by title, resolves free-text
 * owners to members, and reports created / skipped / per-row errors. Write
 * permission is asserted inside `bulkImportRisks`.
 */
export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkImportRisksSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkImportRisks(ctx, body.risks);
            return jsonResponse(result);
        },
    ),
);

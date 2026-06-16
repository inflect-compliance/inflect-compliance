import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkAssignVendor } from '@/app-layer/usecases/vendor';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkVendorAssignSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkVendorAssignSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkAssignVendor(ctx, body.vendorIds, body.ownerUserId);
            return jsonResponse(result);
        },
    ),
);

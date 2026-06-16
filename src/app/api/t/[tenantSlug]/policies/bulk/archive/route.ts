import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkArchivePolicy } from '@/app-layer/usecases/policy';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkPolicyArchiveSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkPolicyArchiveSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkArchivePolicy(ctx, body.policyIds);
            return jsonResponse(result);
        },
    ),
);

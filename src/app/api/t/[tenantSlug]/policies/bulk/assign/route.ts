import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkAssignPolicy } from '@/app-layer/usecases/policy';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkPolicyAssignSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkPolicyAssignSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkAssignPolicy(ctx, body.policyIds, body.ownerUserId);
            return jsonResponse(result);
        },
    ),
);

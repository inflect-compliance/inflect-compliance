import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkAssignRisk } from '@/app-layer/usecases/risk';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkRiskAssignSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkRiskAssignSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkAssignRisk(ctx, body.riskIds, body.ownerUserId);
            return jsonResponse(result);
        },
    ),
);

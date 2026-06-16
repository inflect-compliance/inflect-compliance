import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkSetRiskStatus } from '@/app-layer/usecases/risk';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkRiskStatusSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkRiskStatusSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkSetRiskStatus(ctx, body.riskIds, body.status);
            return jsonResponse(result);
        },
    ),
);

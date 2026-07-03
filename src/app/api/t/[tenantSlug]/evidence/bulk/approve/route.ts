import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkApproveEvidence } from '@/app-layer/usecases/evidence';
import { withValidatedBody } from '@/lib/validation/route';
import { BulkEvidenceApproveSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkEvidenceApproveSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkApproveEvidence(ctx, body.evidenceIds);
            return jsonResponse(result);
        },
    ),
);

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { getCorrelationMatrix, setCorrelation, removeCorrelation } from '@/app-layer/usecases/risk-correlation';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-8 — correlation matrix: GET matrix, PUT set a pair, DELETE remove a pair. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ matrix: await getCorrelationMatrix(ctx) });
    },
);

const SetSchema = z.object({
    riskAId: z.string().min(1),
    riskBId: z.string().min(1),
    coefficient: z.number().min(-1).max(1),
    rationale: z.string().max(2000).optional(),
});

export const PUT = withApiErrorHandling(
    withValidatedBody(SetSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await setCorrelation(ctx, body);
        return jsonResponse({ success: true });
    }),
);

const DelSchema = z.object({ riskAId: z.string().min(1), riskBId: z.string().min(1) });

export const DELETE = withApiErrorHandling(
    withValidatedBody(DelSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await removeCorrelation(ctx, body.riskAId, body.riskBId);
        return jsonResponse({ success: true });
    }),
);

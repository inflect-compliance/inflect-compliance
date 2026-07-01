import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getBia, updateBia, deleteBia, UpdateBiaSchema } from '@/app-layer/usecases/business-impact-analysis';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

type Ctx = { params: Promise<{ tenantSlug: string; id: string }> };

/** GET/PUT/DELETE a single Business Impact Analysis. */
export const GET = withApiErrorHandling(async (req: NextRequest, { params: p }: Ctx) => {
    const params = await p;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await getBia(ctx, params.id));
});

export const PUT = withApiErrorHandling(
    withValidatedBody(UpdateBiaSchema, async (req: NextRequest, { params: p }: Ctx, body) => {
        const params = await p;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse(await updateBia(ctx, params.id, body));
    }),
);

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params: p }: Ctx) => {
    const params = await p;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await deleteBia(ctx, params.id));
});

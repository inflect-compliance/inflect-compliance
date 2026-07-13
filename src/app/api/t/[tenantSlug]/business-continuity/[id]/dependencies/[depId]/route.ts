import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { removeBiaDependency } from '@/app-layer/usecases/business-impact-analysis';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

type Ctx = { params: Promise<{ tenantSlug: string; id: string; depId: string }> };

/** DELETE — detach a dependency from this BIA. */
export const DELETE = withApiErrorHandling(async (req: NextRequest, { params: p }: Ctx) => {
    const params = await p;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await removeBiaDependency(ctx, params.id, params.depId));
});

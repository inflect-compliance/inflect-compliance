import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTenantFrameworkDelta } from '@/app-layer/usecases/framework-delta';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** GET — one delta with its version diff. */
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await getTenantFrameworkDelta(ctx, params.id));
});

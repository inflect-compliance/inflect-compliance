import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { materializeDeltaFindings } from '@/app-layer/usecases/framework-delta';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** POST — explicitly materialise idempotent, source-tagged findings for the delta's new gaps. */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await materializeDeltaFindings(ctx, params.id));
});

import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listTenantFrameworkDeltas } from '@/app-layer/usecases/framework-delta';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** GET — the tenant's framework-update deltas (optionally ?status=). */
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const status = req.nextUrl.searchParams.get('status') ?? undefined;
    return jsonResponse(await listTenantFrameworkDeltas(ctx, { status }));
});

import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { reviewTenantFrameworkDelta } from '@/app-layer/usecases/framework-delta';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** POST — mark a delta REVIEWED or DISMISSED. Body: { status }. */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = (await req.json().catch(() => ({}))) as { status?: 'REVIEWED' | 'DISMISSED' };
    await reviewTenantFrameworkDelta(ctx, params.id, body.status ?? 'REVIEWED');
    return jsonResponse({ ok: true });
});

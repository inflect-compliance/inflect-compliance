/** GET /api/t/[tenantSlug]/policies/[id]/traceability — linked controls + risks/assets inherited via them (read-only). */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getPolicyTraceability } from '@/app-layer/usecases/traceability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await getPolicyTraceability(ctx, params.id));
});

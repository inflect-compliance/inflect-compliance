/** GET /api/t/[tenantSlug]/risks/[id]/test-plans — test plans inherited from the risk's mapped controls (read-only). */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getRiskInheritedTestPlans } from '@/app-layer/usecases/inherited-control-data';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await getRiskInheritedTestPlans(ctx, params.id));
});

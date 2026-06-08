import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { listLiveExecutions } from '@/app-layer/usecases/automation-executions';

type Ctx = { params: Promise<{ tenantSlug: string }> };

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: Ctx) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await listLiveExecutions(ctx));
});

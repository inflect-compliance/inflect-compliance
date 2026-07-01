import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import { resumeWorkflowRun } from '@/app-layer/usecases/workflow-runs';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** POST — resume a paused run after the human has acted on its checkpoint. */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await resumeWorkflowRun(ctx, params.id));
});

import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import { abortWorkflowRun } from '@/app-layer/usecases/workflow-runs';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** POST — abort a run (operator kill-switch). Nothing is left half-applied. */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    await abortWorkflowRun(ctx, params.id);
    return jsonResponse({ ok: true });
});

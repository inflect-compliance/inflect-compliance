import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { reTriggerRule } from '@/app-layer/usecases/automation-executions';

type Ctx = { params: Promise<{ tenantSlug: string; id: string }> };

export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: Ctx) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const result = await reTriggerRule(ctx, params.id);
    // PR-E — 202 Accepted only when a replay was actually enqueued; a no-op
    // (nothing to replay) is a 200 with the reason so the client can tell the
    // user honestly rather than showing a false "re-triggered" success.
    return jsonResponse(result, { status: result.enqueued ? 202 : 200 });
});

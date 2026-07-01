import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import { startWorkflowRun, listWorkflowRuns } from '@/app-layer/usecases/workflow-runs';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** GET — list workflow runs (optionally ?status=). Read-gated by the usecase. */
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const status = req.nextUrl.searchParams.get('status') ?? undefined;
    return jsonResponse(await listWorkflowRuns(ctx, { status }));
});

/** POST — start a workflow run. Body: { workflowKey, input? }. Write/orchestrate-gated. */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = (await req.json().catch(() => ({}))) as { workflowKey?: string; input?: Record<string, unknown> };
    if (!body.workflowKey) return jsonResponse({ error: 'workflowKey is required' }, { status: 400 });
    const result = await startWorkflowRun(ctx, body.workflowKey, body.input ?? {});
    return jsonResponse(result, { status: 201 });
});

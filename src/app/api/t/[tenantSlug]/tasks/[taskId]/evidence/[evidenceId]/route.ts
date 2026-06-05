import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { unlinkTaskEvidence } from '@/app-layer/usecases/task';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// DELETE — detach an evidence row from the task (clears Evidence.taskId;
// the evidence survives in the library).
export const DELETE = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; taskId: string; evidenceId: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const result = await unlinkTaskEvidence(ctx, params.taskId, params.evidenceId);
    return jsonResponse(result);
});

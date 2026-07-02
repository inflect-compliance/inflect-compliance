import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getAssignmentForRespondent } from '@/app-layer/usecases/gap-assessment-assignment';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** GET — the caller's scoped assignment (assignee-or-admin authz in the usecase). */
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; assignmentId: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await getAssignmentForRespondent(ctx, params.assignmentId));
});

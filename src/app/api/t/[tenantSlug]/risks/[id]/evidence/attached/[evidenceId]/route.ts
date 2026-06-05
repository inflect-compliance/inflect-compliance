import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { unlinkRiskEvidence } from '@/app-layer/usecases/risk';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// DELETE — detach evidence (clears the FK; evidence survives in the library).
export const DELETE = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string; evidenceId: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const result = await unlinkRiskEvidence(ctx, params.id, params.evidenceId);
    return jsonResponse(result);
});

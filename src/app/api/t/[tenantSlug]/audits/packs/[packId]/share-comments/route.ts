import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listShareComments } from '@/app-layer/usecases/audit-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// Auditor return-channel feed for a pack — comments, evidence requests,
// findings, and questions the external auditor sent back to the tenant.
export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; packId: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await listShareComments(ctx, params.packId));
});

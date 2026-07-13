import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { resolveShareComment } from '@/app-layer/usecases/audit-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// Tenant marks an OPEN auditor request/finding/question RESOLVED.
export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; packId: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await resolveShareComment(ctx, params.packId, params.id));
});

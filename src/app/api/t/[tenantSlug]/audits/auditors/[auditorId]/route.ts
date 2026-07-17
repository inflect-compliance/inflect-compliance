import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { revokeAuditorAccount } from '@/app-layer/usecases/audit-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// PR-O — account-level revoke: move an AuditorAccount to REVOKED and drop all
// its pack access (distinct from the per-pack DELETE on .../auditors/access).
export const DELETE = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; auditorId: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await revokeAuditorAccount(ctx, params.auditorId));
});

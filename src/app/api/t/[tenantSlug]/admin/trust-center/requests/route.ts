import { listTrustCenterAccessRequests } from '@/app-layer/usecases/trust-center-documents';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

/** PR-8 — admin: list gated-document access requests (admin.manage). */
export const GET = withApiErrorHandling(requirePermission<{ tenantSlug: string }>('admin.manage', async (_req, _a, ctx) => {
    return jsonResponse({ requests: await listTrustCenterAccessRequests(ctx) });
}));

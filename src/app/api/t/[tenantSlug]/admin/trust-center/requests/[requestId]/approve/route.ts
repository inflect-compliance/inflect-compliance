import { approveTrustCenterAccessRequest } from '@/app-layer/usecases/trust-center-documents';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; requestId: string };

/** PR-8 — admin: approve an access request → issue a single-use download token. */
export const POST = withApiErrorHandling(requirePermission<Params>('admin.manage', async (_req, { params }, ctx) => {
    const { requestId } = await params;
    return jsonResponse(await approveTrustCenterAccessRequest(ctx, requestId));
}));

import { revokeDeviceToken } from '@/app-layer/usecases/device';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; tokenId: string };

/** PR-5 — revoke a device-agent token. personnel.manage. */
export const DELETE = withApiErrorHandling(
    requirePermission<Params>('admin.manage', async (_req, { params }, ctx) => {
        const { tokenId } = await params;
        const result = await revokeDeviceToken(ctx, tokenId);
        return jsonResponse(result);
    }),
);

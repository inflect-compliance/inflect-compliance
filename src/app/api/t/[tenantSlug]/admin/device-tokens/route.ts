import { listDeviceTokens, issueDeviceToken, IssueDeviceTokenSchema } from '@/app-layer/usecases/device';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/** PR-5 — device-agent tokens. Issue/list gated by personnel.manage. */
export const GET = withApiErrorHandling(
    requirePermission<{ tenantSlug: string }>('admin.manage', async (_req, _routeArgs, ctx) => {
        const tokens = await listDeviceTokens(ctx);
        return jsonResponse({ tokens });
    }),
);

export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string }>('admin.manage', async (req, _routeArgs, ctx) => {
        const body = await parseJsonBody(req, IssueDeviceTokenSchema);
        const token = await issueDeviceToken(ctx, body);
        return jsonResponse(token, { status: 201 });
    }),
);

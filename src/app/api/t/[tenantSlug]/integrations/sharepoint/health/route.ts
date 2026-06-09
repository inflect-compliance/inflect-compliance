import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { getSharePointHealth } from '@/app-layer/integrations/providers/sharepoint';

/**
 * SP-5 — SharePoint sync-health dashboard data. Gated by `admin.manage`.
 */
export const GET = withApiErrorHandling(
    requirePermission('admin.manage', async (_req: NextRequest, _routeArgs, ctx) => {
        return jsonResponse(await getSharePointHealth(ctx));
    }),
);

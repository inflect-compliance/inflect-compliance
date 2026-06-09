import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { testSharePointConnection } from '@/app-layer/integrations/providers/sharepoint';

/**
 * SP-1 — test a SharePoint connection (calls Graph with the stored token and
 * records lastTestedAt / lastTestStatus). Gated by `admin.manage`.
 */
const Body = z.object({ connectionId: z.string().min(1) });

export const POST = withApiErrorHandling(
    requirePermission('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
        const { connectionId } = Body.parse(await req.json());
        return jsonResponse(await testSharePointConnection(ctx, connectionId));
    }),
);

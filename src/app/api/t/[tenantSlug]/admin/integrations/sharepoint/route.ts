import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { badRequest } from '@/lib/errors/types';
import {
    listSharePointConnections,
    disconnectSharePoint,
} from '@/app-layer/integrations/providers/sharepoint';

/**
 * SP-1 — SharePoint connection collection.
 * Gated by `admin.manage` (the admin/integrations root); denials audit as
 * AUTHZ_DENIED.
 */

/** GET — list SharePoint connections for the tenant (no secrets). */
export const GET = withApiErrorHandling(
    requirePermission('admin.manage', async (_req: NextRequest, _routeArgs, ctx) => {
        return jsonResponse(await listSharePointConnections(ctx));
    }),
);

/** DELETE ?connectionId — disconnect a SharePoint connection. */
export const DELETE = withApiErrorHandling(
    requirePermission('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
        const connectionId = req.nextUrl.searchParams.get('connectionId');
        if (!connectionId) throw badRequest('connectionId is required');
        await disconnectSharePoint(ctx, connectionId);
        return new NextResponse(null, { status: 204 });
    }),
);

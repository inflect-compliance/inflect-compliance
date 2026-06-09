import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { badRequest } from '@/lib/errors/types';
import {
    listSharePointSites,
    updateSharePointAllowedSites,
} from '@/app-layer/integrations/providers/sharepoint';

/**
 * SP-1 — SharePoint site selection for a connection.
 * GET ?connectionId  → live list of reachable sites (for the picker).
 * PATCH ?connectionId → set the tenant's allowed site IDs.
 * Gated by `admin.manage`.
 */

export const GET = withApiErrorHandling(
    requirePermission('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
        const connectionId = req.nextUrl.searchParams.get('connectionId');
        if (!connectionId) throw badRequest('connectionId is required');
        return jsonResponse(await listSharePointSites(ctx, connectionId));
    }),
);

const PatchBody = z.object({ siteIds: z.array(z.string().min(1)).max(200) });

export const PATCH = withApiErrorHandling(
    requirePermission('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
        const connectionId = req.nextUrl.searchParams.get('connectionId');
        if (!connectionId) throw badRequest('connectionId is required');
        const { siteIds } = PatchBody.parse(await req.json());
        await updateSharePointAllowedSites(ctx, connectionId, siteIds);
        return jsonResponse({ ok: true });
    }),
);

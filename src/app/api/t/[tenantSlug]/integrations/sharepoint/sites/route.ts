import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { badRequest } from '@/lib/errors/types';
import { getSharePointSitesAndDrives } from '@/app-layer/integrations/providers/sharepoint';

/**
 * SP-2 — sites + drives for the file picker's selectors (practitioner-facing).
 * GET ?connectionId → { sites, drives: Record<siteId, drives[]> }.
 * Gated by `evidence.upload` — the picker sources evidence.
 */
export const GET = withApiErrorHandling(
    requirePermission('evidence.upload', async (req: NextRequest, _routeArgs, ctx) => {
        const connectionId = req.nextUrl.searchParams.get('connectionId');
        if (!connectionId) throw badRequest('connectionId is required');
        return jsonResponse(await getSharePointSitesAndDrives(ctx, connectionId));
    }),
);

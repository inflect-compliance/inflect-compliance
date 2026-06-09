import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { badRequest } from '@/lib/errors/types';
import { browseSharePoint } from '@/app-layer/integrations/providers/sharepoint';

/**
 * SP-2 — lazy folder/file listing for the picker (practitioner-facing).
 * GET ?connectionId&driveId&itemId&pageToken
 *   → { items: SpBrowseItem[], nextPageToken? }
 * Cursor pagination passes through the Graph `@odata.nextLink`.
 * Gated by `evidence.upload`.
 */
export const GET = withApiErrorHandling(
    requirePermission('evidence.upload', async (req: NextRequest, _routeArgs, ctx) => {
        const sp = req.nextUrl.searchParams;
        const connectionId = sp.get('connectionId');
        const driveId = sp.get('driveId');
        if (!connectionId || !driveId) throw badRequest('connectionId and driveId are required');
        return jsonResponse(
            await browseSharePoint(ctx, {
                connectionId,
                driveId,
                itemId: sp.get('itemId') ?? undefined,
                pageToken: sp.get('pageToken') ?? undefined,
            }),
        );
    }),
);

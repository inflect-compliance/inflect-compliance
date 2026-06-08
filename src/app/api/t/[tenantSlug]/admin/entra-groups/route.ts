import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import {
    listEntraGroupMappings,
    createEntraGroupMapping,
} from '@/app-layer/usecases/entra-group-mappings';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** EI-2 — Entra group → role mappings. Gated by `admin.manage`. */

export const GET = withApiErrorHandling(
    requirePermission('admin.manage', async (_req: NextRequest, _routeArgs, ctx) => {
        return jsonResponse(await listEntraGroupMappings(ctx));
    }),
);

export const POST = withApiErrorHandling(
    requirePermission('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
        const mapping = await createEntraGroupMapping(ctx, await req.json());
        return jsonResponse(mapping, { status: 201 });
    }),
);

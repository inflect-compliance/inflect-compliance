import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import {
    updateEntraGroupMapping,
    deleteEntraGroupMapping,
} from '@/app-layer/usecases/entra-group-mappings';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** EI-2 — single Entra group mapping. Gated by `admin.manage`. */

type Params = { tenantSlug: string; id: string };

export const PATCH = withApiErrorHandling(
    requirePermission<Params>(
        'admin.manage',
        async (req: NextRequest, { params }, ctx) => {
            return jsonResponse(await updateEntraGroupMapping(ctx, params.id, await req.json()));
        },
    ),
);

export const DELETE = withApiErrorHandling(
    requirePermission<Params>(
        'admin.manage',
        async (_req: NextRequest, { params }, ctx) => {
            return jsonResponse(await deleteEntraGroupMapping(ctx, params.id));
        },
    ),
);

import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { syncConnection } from '@/app-layer/usecases/integrations';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; connectionId: string };

/**
 * POST /api/t/[tenantSlug]/admin/integrations/[connectionId]/sync
 *
 * P1 — connection-level "Sync now / run checks now". Runs the directory sync
 * (identity providers) + every control wired to this provider, returning a
 * result summary immediately.
 */
export const POST = withApiErrorHandling(
    requirePermission<Params>('admin.manage', async (_req: NextRequest, { params }, ctx) => {
        const { connectionId } = await params;
        const result = await syncConnection(ctx, connectionId, { triggeredBy: 'manual' });
        return jsonResponse(result);
    }),
);

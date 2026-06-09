import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { listSharePointConnections } from '@/app-layer/integrations/providers/sharepoint';

/**
 * SP-3 — practitioner-readable list of SharePoint connections (id + name) so
 * the evidence/policy pickers can discover a connection without admin rights.
 * Gated by `evidence.upload`.
 */
export const GET = withApiErrorHandling(
    requirePermission('evidence.upload', async (_req: NextRequest, _routeArgs, ctx) => {
        const conns = await listSharePointConnections(ctx);
        return jsonResponse(conns.map((c) => ({ id: c.id, name: c.name })));
    }),
);

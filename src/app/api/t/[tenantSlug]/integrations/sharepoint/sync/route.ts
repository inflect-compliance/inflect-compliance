import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { enqueue } from '@/app-layer/jobs/queue';

/**
 * SP-3 — on-demand delta sync for a SharePoint connection. Enqueues the
 * `sharepoint-delta-sync` job and returns its id for polling. Gated by
 * `evidence.upload` (re-imports write evidence).
 */
const Body = z.object({ connectionId: z.string().min(1) });

export const POST = withApiErrorHandling(
    requirePermission('evidence.upload', async (req: NextRequest, _routeArgs, ctx) => {
        const { connectionId } = Body.parse(await req.json());
        const job = await enqueue('sharepoint-delta-sync', {
            tenantId: ctx.tenantId,
            connectionId,
            actorUserId: ctx.userId,
            triggeredBy: 'manual',
            requestId: ctx.requestId,
        });
        return jsonResponse({ jobId: job.id }, { status: 202 });
    }),
);

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import {
    linkPolicyToSharePoint,
    unlinkPolicyFromSharePoint,
    getPolicySharePointStatus,
} from '@/app-layer/usecases/policy-sharepoint-sync';

/**
 * SP-4 — link / unlink a policy ↔ SharePoint + report conflict status.
 * Gated by `policies.edit`.
 */

/** GET — { linked, webUrl, conflict } for the policy's SharePoint link. */
export const GET = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; id: string }>(
        'policies.edit',
        async (_req: NextRequest, { params }, ctx) => {
            return jsonResponse(await getPolicySharePointStatus(ctx, params.id));
        },
    ),
);

const LinkBody = z.object({
    connectionId: z.string().min(1),
    driveId: z.string().min(1),
    itemId: z.string().min(1),
});

/** POST — link the policy to a SharePoint file (+ register a subscription). */
export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; id: string }>(
        'policies.edit',
        async (req: NextRequest, { params }, ctx) => {
            const body = LinkBody.parse(await req.json());
            return jsonResponse(await linkPolicyToSharePoint(ctx, params.id, body));
        },
    ),
);

/** DELETE — unlink + delete the subscription. */
export const DELETE = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; id: string }>(
        'policies.edit',
        async (_req: NextRequest, { params }, ctx) => {
            await unlinkPolicyFromSharePoint(ctx, params.id);
            return new NextResponse(null, { status: 204 });
        },
    ),
);

import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { listAssignments, dispatchAssignments } from '@/app-layer/usecases/gap-assessment-assignment';
import { DispatchAssignmentsSchema } from '@/app-layer/schemas/gap-assessment-assignment';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** GET — owner view: every assignment for the run. Admin-gated. */
export const GET = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; id: string }>(
        'admin.manage',
        async (_req: NextRequest, { params }, ctx) => {
            return jsonResponse(await listAssignments(ctx, params.id));
        },
    ),
);

/** POST — dispatch the run to its respondents (rejects a WIZARD_BASELINE run). */
export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; id: string }>(
        'admin.manage',
        async (req: NextRequest, { params }, ctx) => {
            const body = DispatchAssignmentsSchema.parse(await req.json().catch(() => ({})));
            return jsonResponse(await dispatchAssignments(ctx, params.id, body.roleToUserId));
        },
    ),
);

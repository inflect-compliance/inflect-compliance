import { completeTrainingAssignment } from '@/app-layer/usecases/training';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; assignmentId: string };

/** PR-6 — mark a training assignment complete (personnel.manage). */
export const POST = withApiErrorHandling(
    requirePermission<Params>('personnel.manage', async (_req, { params }, ctx) => {
        const { assignmentId } = await params;
        return jsonResponse(await completeTrainingAssignment(ctx, assignmentId));
    }),
);

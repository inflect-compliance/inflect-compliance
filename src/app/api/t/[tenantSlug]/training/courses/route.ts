import { createTrainingCourse, CreateCourseSchema } from '@/app-layer/usecases/training';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/** PR-6 — create a training course (personnel.manage). */
export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string }>('personnel.manage', async (req, _a, ctx) => {
        const body = await parseJsonBody(req, CreateCourseSchema);
        return jsonResponse(await createTrainingCourse(ctx, body), { status: 201 });
    }),
);

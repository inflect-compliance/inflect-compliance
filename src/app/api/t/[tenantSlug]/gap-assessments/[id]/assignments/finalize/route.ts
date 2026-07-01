import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { finalizeAssessment } from '@/app-layer/usecases/gap-assessment-assignment';
import { FinalizeAssessmentSchema } from '@/app-layer/schemas/gap-assessment-assignment';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** POST — finalize a delegated run (all submitted, or owner force). Admin-gated. */
export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; id: string }>(
        'admin.manage',
        async (req: NextRequest, { params }, ctx) => {
            const body = FinalizeAssessmentSchema.parse(await req.json().catch(() => ({})));
            return jsonResponse(await finalizeAssessment(ctx, params.id, { force: body.force }));
        },
    ),
);

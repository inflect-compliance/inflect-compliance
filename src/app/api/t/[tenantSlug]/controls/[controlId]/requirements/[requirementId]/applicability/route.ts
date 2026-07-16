import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { setRequirementLinkApplicability } from '@/app-layer/usecases/control';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// null applicability clears the per-framework override (revert to inherit).
const Schema = z.object({
    applicability: z.enum(['APPLICABLE', 'NOT_APPLICABLE']).nullable(),
    justification: z.string().max(2000).optional().nullable(),
}).strip();

/** Set (or clear) the per-framework applicability override on a control's
 *  mapping to one requirement. */
export const POST = withApiErrorHandling(
    withValidatedBody(
        Schema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; controlId: string; requirementId: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const updated = await setRequirementLinkApplicability(
                ctx,
                params.controlId,
                params.requirementId,
                body.applicability,
                body.justification ?? null,
            );
            return jsonResponse(updated);
        },
    ),
);

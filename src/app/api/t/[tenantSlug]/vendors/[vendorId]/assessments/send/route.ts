import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { sendAssessment } from '@/app-layer/usecases/vendor-assessment-send';
import { withValidatedBody } from '@/lib/validation/route';
import { SendVendorAssessmentSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// Epic G-3 — POST /api/t/[tenantSlug]/vendors/[vendorId]/assessments/send
//
// Turns a published VendorAssessmentTemplate into a concrete
// VendorAssessment for this vendor and queues the external
// respondent's invitation email. Authorization mirrors the sibling
// assessments/start + assessments/[assessmentId]/decide routes: the
// tenant-access gate runs in getTenantCtx and the send usecase itself
// asserts write authority via assertCanRunAssessment(ctx). Vendors is
// not a PRIVILEGED_ROOT in the Epic C.1 permission-coverage guardrail,
// so no route-permissions.ts entry is required.
export const POST = withApiErrorHandling(
    withValidatedBody(
        SendVendorAssessmentSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; vendorId: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await sendAssessment(ctx, params.vendorId, body.templateVersionId, {
                respondentEmail: body.respondentEmail,
                respondentName: body.respondentName,
                expiresInDays: body.expiresInDays,
                force: body.force,
            });
            return jsonResponse(result, { status: 201 });
        },
    ),
);

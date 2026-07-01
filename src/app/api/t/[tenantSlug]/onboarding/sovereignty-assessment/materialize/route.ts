import { getTenantCtx } from '@/app-layer/context';
import { materializeSelfAssessmentSuggestions } from '@/app-layer/usecases/self-assessment';
import { MaterializeSelfAssessmentSchema } from '@/app-layer/schemas/self-assessment';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/**
 * POST → materialise the APPROVED Digital Sovereignty gap suggestions into real
 * risks + controls via the existing createRisk / createControl usecases. The
 * server re-scores from the submitted answers and only creates approved
 * dimensions that are genuinely below the gap threshold. Idempotent. NEVER
 * automatic — nothing is written until the user approves the "Create these?"
 * list. Mutation-tier rate-limited.
 */
export const POST = withApiErrorHandling(
    withValidatedBody(
        MaterializeSelfAssessmentSchema,
        async (req, { params }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const ctx = await getTenantCtx(await params, req);
            const result = await materializeSelfAssessmentSuggestions(ctx, body);
            return jsonResponse(result);
        },
    ),
);

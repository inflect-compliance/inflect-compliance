import { z } from 'zod';
import { approveProposal } from '@/app-layer/usecases/vendor-doc-extraction';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; id: string };

const BodySchema = z.object({ editedAnswerJson: z.unknown().optional() });

/**
 * POST — approve a proposed answer → materialise a real VendorAssessmentAnswer.
 * The ONLY path that commits an AI-proposed answer (propose-not-commit).
 */
export const POST = withApiErrorHandling(
    requirePermission<Params>('vendors.edit', async (req, { params }, ctx) => {
        const { id } = await params;
        const body = await parseJsonBody(req, BodySchema);
        return jsonResponse(await approveProposal(ctx, id, body.editedAnswerJson));
    }),
);

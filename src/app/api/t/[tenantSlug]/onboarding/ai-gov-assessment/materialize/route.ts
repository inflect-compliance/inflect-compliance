import { getTenantCtx } from '@/app-layer/context';
import { raiseFindingsFromAiGovGaps, type AiGovArchitecture } from '@/app-layer/usecases/ai-gov-self-assessment';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { z } from 'zod';

const MaterializeSchema = z
    .object({
        architecture: z.enum(['NONE', 'RAG', 'AGENTIC', 'BOTH']).optional(),
    })
    .strip();

// POST → explicitly convert HIGH/CRITICAL AI-governance gaps to Findings via
// the existing createFinding usecase. Idempotent. NEVER automatic. Mutation-
// tier rate-limited.
export const POST = withApiErrorHandling(
    withValidatedBody(
        MaterializeSchema,
        async (req, { params }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const ctx = await getTenantCtx(await params, req);
            const result = await raiseFindingsFromAiGovGaps(ctx, {
                architecture: body.architecture as AiGovArchitecture | undefined,
            });
            return jsonResponse(result);
        },
    ),
);

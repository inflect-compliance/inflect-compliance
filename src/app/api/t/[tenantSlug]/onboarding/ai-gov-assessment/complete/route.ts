import { getTenantCtx } from '@/app-layer/context';
import { completeAiGovAssessment } from '@/app-layer/usecases/ai-gov-self-assessment';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// POST → mark the AI-governance self-assessment complete (partial completion
// allowed). Mutation-tier rate-limited.
export const POST = withApiErrorHandling(
    async (req, { params }: { params: Promise<{ tenantSlug: string }> }) => {
        const ctx = await getTenantCtx(await params, req);
        const assessment = await completeAiGovAssessment(ctx);
        return jsonResponse(assessment);
    },
);

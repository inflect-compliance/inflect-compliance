import { getTenantCtx } from '@/app-layer/context';
import { getAiGovAssessmentState, type AiGovArchitecture } from '@/app-layer/usecases/ai-gov-self-assessment';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

const ARCH = new Set<AiGovArchitecture>(['NONE', 'RAG', 'AGENTIC', 'BOTH']);

// GET → the AI-governance self-assessment state (domains, questions, answers,
// the 3-way coverage readout). `?architecture=` gates the conditional
// (RAG / AGENTIC) questions. Auth + tenant scoping via getTenantCtx.
export const GET = withApiErrorHandling(
    async (req, { params }: { params: Promise<{ tenantSlug: string }> }) => {
        const ctx = await getTenantCtx(await params, req);
        const raw = new URL(req.url).searchParams.get('architecture');
        const architecture = raw && ARCH.has(raw as AiGovArchitecture) ? (raw as AiGovArchitecture) : 'NONE';
        const state = await getAiGovAssessmentState(ctx, { architecture });
        return jsonResponse(state);
    },
);

import { getTenantCtx } from '@/app-layer/context';
import { getNis2AssessmentState } from '@/app-layer/usecases/onboarding-nis2';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// GET → the NIS2 self-assessment state (domains, questions, answers,
// progress). Auth + tenant scoping via getTenantCtx; the usecase asserts
// ADMIN (assertCanManageOnboarding).
export const GET = withApiErrorHandling(
    async (req, { params }: { params: Promise<{ tenantSlug: string }> }) => {
        const ctx = await getTenantCtx(await params, req);
        const state = await getNis2AssessmentState(ctx);
        return jsonResponse(state);
    },
);

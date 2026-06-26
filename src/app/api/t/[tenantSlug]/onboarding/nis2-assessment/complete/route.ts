import { getTenantCtx } from '@/app-layer/context';
import { completeNis2Assessment } from '@/app-layer/usecases/onboarding-nis2';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// POST → mark the assessment complete (partial completion allowed) and
// advance the onboarding step when mid-flight. Mutation-tier rate-limited.
export const POST = withApiErrorHandling(
    async (req, { params }: { params: Promise<{ tenantSlug: string }> }) => {
        const ctx = await getTenantCtx(await params, req);
        const assessment = await completeNis2Assessment(ctx);
        return jsonResponse(assessment);
    },
);

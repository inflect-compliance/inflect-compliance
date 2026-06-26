import { getTenantCtx } from '@/app-layer/context';
import {
    computeNis2Readiness,
    listNis2ReadinessSnapshots,
    suggestNis2FocusAreas,
} from '@/app-layer/usecases/nis2-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// GET → readiness score + prioritized gaps + trend snapshots + focus
// areas. Pure derivation (no mutation). ADMIN-gated in the usecase.
export const GET = withApiErrorHandling(
    async (req, { params }: { params: Promise<{ tenantSlug: string }> }) => {
        const ctx = await getTenantCtx(await params, req);
        const [readiness, snapshots, focusAreas] = await Promise.all([
            computeNis2Readiness(ctx),
            listNis2ReadinessSnapshots(ctx),
            suggestNis2FocusAreas(ctx),
        ]);
        return jsonResponse({ readiness, snapshots, focusAreas });
    },
);

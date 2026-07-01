import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listNis2GapAssessmentHistory } from '@/app-layer/usecases/nis2-gap-lifecycle';
import { computeNis2Readiness, listNis2ReadinessSnapshots } from '@/app-layer/usecases/nis2-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** GET — the NIS2 gap-assessment lifecycle surface: run history, readiness
 *  trend snapshots, and the latest run's scored readiness (+ prioritised gaps). */
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const [history, snapshots, latest] = await Promise.all([
        listNis2GapAssessmentHistory(ctx),
        listNis2ReadinessSnapshots(ctx),
        computeNis2Readiness(ctx),
    ]);
    return jsonResponse({ history, snapshots, latest });
});

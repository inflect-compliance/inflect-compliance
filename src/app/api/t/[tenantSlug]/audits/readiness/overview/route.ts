/**
 * GET /api/t/:tenantSlug/audits/readiness/overview
 *
 * Page-data endpoint for the audit-readiness overview page. Replaces
 * the previous client-side 1+N waterfall (cycles list followed by
 * per-cycle readiness fetches) with one server-side aggregation.
 *
 * Response shape mirrors `ReadinessOverviewPayload` — see the
 * `getReadinessOverview` docblock for failure-mode semantics.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getReadinessOverview } from '@/app-layer/usecases/audit-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse(await getReadinessOverview(ctx));
    },
);

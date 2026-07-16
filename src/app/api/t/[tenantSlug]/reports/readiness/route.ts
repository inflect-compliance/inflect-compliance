import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { generateReadinessReport } from '@/app-layer/usecases/framework/coverage';
import { resolveInstalledFrameworkKey } from '@/app-layer/usecases/soa';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * PR-G — per-framework Coverage/Readiness report for the Reports catalog. The
 * framework selector re-fetches this when the user switches frameworks.
 * `?framework=<key>` scopes the report; absent → the resolved installed default.
 */
export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const requested = new URL(req.url).searchParams.get('framework');
        const frameworkKey =
            requested && requested.length > 0
                ? requested
                : await resolveInstalledFrameworkKey(ctx);
        const report = await generateReadinessReport(ctx, frameworkKey);
        return jsonResponse(report);
    },
);

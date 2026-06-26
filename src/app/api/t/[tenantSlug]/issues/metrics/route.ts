/** @deprecated Use /api/t/[tenantSlug]/tasks/metrics */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTaskMetrics } from '@/app-layer/usecases/task';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { cachedAggregationRead } from '@/lib/cache/aggregation-cache';
import { AGGREGATIONS } from '@/lib/cache/aggregation-registry';

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const metrics = await cachedAggregationRead({
        scopeKey: ctx.tenantId,
        aggregation: 'issues-metrics',
        dependsOn: AGGREGATIONS['issues-metrics'].dependsOn,
        ttlSeconds: AGGREGATIONS['issues-metrics'].ttlSeconds,
        compute: () => getTaskMetrics(ctx),
    });
    return jsonResponse(metrics);
});

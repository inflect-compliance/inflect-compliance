/**
 * GET /api/t/[tenantSlug]/evidence/retention
 *
 * EP-4 — reader-gated tenant-wide evidence retention/KPI aggregate. Returns
 * `getEvidenceRetentionMetrics` (authoritative status + expiry bucket counts
 * over the FULL dataset). Consumed by the Evidence list island via
 * `useTenantSWR(CACHE_KEYS.evidence.retention())`, seeded by the SSR
 * `initialMetrics` prop so the KPI strips stay correct past the SSR row cap.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getEvidenceRetentionMetrics } from '@/app-layer/usecases/evidence';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const metrics = await getEvidenceRetentionMetrics(ctx);
    return jsonResponse(metrics);
});

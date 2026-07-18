/**
 * GET /api/t/[tenantSlug]/vendors/[vendorId]/assessments
 *
 * PR-S — the vendor-detail Assessments tab list. The vendor `getById` payload
 * never carried the assessments relation (a regression that left the tab empty),
 * so the tab fetches this dedicated endpoint instead.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listVendorAssessments } from '@/app-layer/usecases/vendor-assessment-review';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; vendorId: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await listVendorAssessments(ctx, params.vendorId));
});

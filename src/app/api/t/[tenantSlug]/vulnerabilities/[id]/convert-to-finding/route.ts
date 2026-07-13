import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { convertVulnerabilityToFinding } from '@/app-layer/usecases/vulnerability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// Explicit, opt-in conversion of a vulnerability into a Finding via the
// existing createFinding usecase (sourceKind='CVE').
export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const { finding, nudge } = await convertVulnerabilityToFinding(ctx, params.id);
    return jsonResponse({ ...finding, nudge }, { status: 201 });
});

import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { convertVulnerabilityToRisk } from '@/app-layer/usecases/vulnerability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// Explicit, opt-in conversion of a vulnerability into a Risk via the existing
// createRisk usecase (connects vuln management into the risk graph).
export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const risk = await convertVulnerabilityToRisk(ctx, params.id);
    return jsonResponse(risk, { status: 201 });
});

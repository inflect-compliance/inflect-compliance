import { NextRequest } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import * as policyUsecases from '@/app-layer/usecases/policy';
import { getInstalledMappedFrameworks } from '@/app-layer/usecases/policy-template-mapping';
import { jsonResponse } from '@/lib/api-response';

// GET /api/t/[tenantSlug]/policies/templates — list global templates,
// annotated with the installed frameworks each framework-aware template
// would pre-map to (powers the "Maps to ISO 27001 + NIS2" picker badge).
export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const templates = await policyUsecases.listPolicyTemplates(ctx);
    const mapped = await getInstalledMappedFrameworks(ctx, templates.map((t) => t.externalRef));
    const annotated = templates.map((t) => ({
        ...t,
        mappedFrameworks: (t.externalRef && mapped[t.externalRef]) || [],
    }));
    return jsonResponse(annotated);
});

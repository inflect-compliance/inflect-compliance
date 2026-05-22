/**
 * GET /api/t/[tenantSlug]/vendor-assessment-templates/[templateId]
 *
 * Returns the full template tree (template + sections + questions
 * ordered by sortOrder) for the builder UI.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTemplateTree } from '@/app-layer/usecases/vendor-assessment-template';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; templateId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const template = await getTemplateTree(ctx, params.templateId);
        return jsonResponse(template);
    },
);

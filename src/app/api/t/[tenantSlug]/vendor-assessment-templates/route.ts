/**
 * Epic G-3 — vendor assessment template index.
 *
 *   GET  /api/t/[tenantSlug]/vendor-assessment-templates
 *        → list (latest version per key)
 *   POST /api/t/[tenantSlug]/vendor-assessment-templates
 *        → create a new draft template
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import {
    listTemplates,
    createTemplate,
} from '@/app-layer/usecases/vendor-assessment-template';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateVendorAssessmentTemplateSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const templates = await listTemplates(ctx);
        return jsonResponse(templates);
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateVendorAssessmentTemplateSchema,
        async (
            req,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const template = await createTemplate(ctx, body);
            return jsonResponse(template, { status: 201 });
        },
    ),
);

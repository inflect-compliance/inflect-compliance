import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { listTemplates, createTemplate } from '@/app-layer/usecases/risk-report';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** PR-L — report templates: GET list, POST create a custom template. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ templates: await listTemplates(ctx) });
    },
);

const CreateSchema = z.object({
    name: z.string().min(1).max(200),
    type: z.enum(['PORTFOLIO_SUMMARY', 'RISK_DEEP_DIVE', 'BIA', 'CUSTOM']),
    description: z.string().max(2000).nullable().optional(),
}).strip();

export const POST = withApiErrorHandling(
    withValidatedBody(CreateSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({
            success: true,
            template: await createTemplate(ctx, { name: body.name, type: body.type, description: body.description ?? undefined }),
        }, { status: 201 });
    }),
);

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import {
    listAutomationTemplates,
    createRuleFromTemplate,
} from '@/app-layer/usecases/automation-templates';

type Ctx = { params: Promise<{ tenantSlug: string }> };

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: Ctx) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(listAutomationTemplates(ctx));
});

const UseTemplateSchema = z.object({ templateId: z.string().min(1) });

export const POST = withApiErrorHandling(
    withValidatedBody(UseTemplateSchema, async (req, { params: paramsPromise }: Ctx, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const rule = await createRuleFromTemplate(ctx, body.templateId);
        return jsonResponse(rule, { status: 201 });
    }),
);

import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import {
    getAutomationRule,
    updateAutomationRule,
    archiveAutomationRule,
} from '@/app-layer/usecases/automation-rules';
import { UpdateAutomationRuleSchema } from '@/app-layer/schemas/automation.schemas';

type Ctx = { params: Promise<{ tenantSlug: string; id: string }> };

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: Ctx) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const rule = await getAutomationRule(ctx, params.id);
    return jsonResponse(rule);
});

export const PUT = withApiErrorHandling(
    withValidatedBody(UpdateAutomationRuleSchema, async (req, { params: paramsPromise }: Ctx, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const rule = await updateAutomationRule(ctx, params.id, {
            name: body.name,
            description: body.description,
            triggerEvent: body.triggerEvent,
            triggerFilter: body.triggerFilter,
            actionType: body.actionType,
            actionConfig: body.actionConfig as never,
            status: body.status,
            priority: body.priority,
        });
        return jsonResponse(rule);
    }),
);

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: Ctx) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const rule = await archiveAutomationRule(ctx, params.id);
    return jsonResponse(rule);
});

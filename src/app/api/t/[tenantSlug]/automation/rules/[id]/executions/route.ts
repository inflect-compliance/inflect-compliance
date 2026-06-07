import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { listRuleExecutions } from '@/app-layer/usecases/automation-executions';
import { AutomationExecutionStatus } from '@prisma/client';

type Ctx = { params: Promise<{ tenantSlug: string; id: string }> };

const QuerySchema = z
    .object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
        status: z.nativeEnum(AutomationExecutionStatus).optional(),
    })
    .strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: Ctx) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const q = QuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const result = await listRuleExecutions(ctx, params.id, {
        limit: q.limit,
        cursor: q.cursor,
        status: q.status,
    });
    return jsonResponse(result);
});

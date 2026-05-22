import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import {
    listProcessMaps,
    createProcessMap,
} from '@/app-layer/usecases/process-map';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateProcessMapSchema } from '@/app-layer/schemas/process-map';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const maps = await listProcessMaps(ctx);
        return jsonResponse(maps);
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateProcessMapSchema,
        async (
            req,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const map = await createProcessMap(ctx, body);
            return jsonResponse(map, { status: 201 });
        },
    ),
);

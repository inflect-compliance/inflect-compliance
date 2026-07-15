import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import {
    getProcessMap,
    saveProcessMap,
    setProcessMapCanvasMode,
    setProcessMapStatus,
    deleteProcessMap,
} from '@/app-layer/usecases/process-map';
import { withValidatedBody } from '@/lib/validation/route';
import { SaveProcessMapSchema } from '@/app-layer/schemas/process-map';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** PATCH — metadata-only switch (no graph save): canvas mode OR lifecycle
 *  status. Exactly one field is acted on per request (canvasMode wins if both
 *  are somehow sent). */
const PatchProcessMapSchema = z
    .object({
        canvasMode: z.enum(['DOCUMENT', 'AUTOMATION']).optional(),
        status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
    })
    .refine((v) => v.canvasMode !== undefined || v.status !== undefined, {
        message: 'One of canvasMode or status is required',
    });

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const map = await getProcessMap(ctx, params.id);
        return jsonResponse(map);
    },
);

export const PUT = withApiErrorHandling(
    withValidatedBody(
        SaveProcessMapSchema,
        async (
            req,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const map = await saveProcessMap(ctx, params.id, body);
            return jsonResponse(map);
        },
    ),
);

export const PATCH = withApiErrorHandling(
    withValidatedBody(
        PatchProcessMapSchema,
        async (
            req,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = body.canvasMode
                ? await setProcessMapCanvasMode(ctx, params.id, body.canvasMode)
                : await setProcessMapStatus(ctx, params.id, body.status!);
            return jsonResponse(result);
        },
    ),
);

export const DELETE = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const result = await deleteProcessMap(ctx, params.id);
        return jsonResponse(result);
    },
);

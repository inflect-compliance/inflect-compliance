import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { updateNode, deleteNode, aggregateByHierarchy } from '@/app-layer/usecases/risk-hierarchy';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-5 — single node: GET aggregation, PATCH update, DELETE (cascades links). */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; nodeId: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ aggregation: await aggregateByHierarchy(ctx, params.nodeId) });
    },
);

const PatchSchema = z.object({ name: z.string().min(1).max(200).optional(), parentId: z.string().nullable().optional(), sortOrder: z.number().int().optional() });

export const PATCH = withApiErrorHandling(
    withValidatedBody(PatchSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; nodeId: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await updateNode(ctx, params.nodeId, body);
        return jsonResponse({ success: true });
    }),
);

export const DELETE = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; nodeId: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await deleteNode(ctx, params.nodeId);
        return jsonResponse({ success: true });
    },
);

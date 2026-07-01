import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { linkBiaToControl } from '@/app-layer/usecases/business-impact-analysis';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

const LinkSchema = z.object({ controlId: z.string().min(1) });

/** POST — attach this BIA to a control as evidence (kind BIA). */
export const POST = withApiErrorHandling(
    withValidatedBody(
        LinkSchema,
        async (req: NextRequest, { params: p }: { params: Promise<{ tenantSlug: string; id: string }> }, body) => {
            const params = await p;
            const ctx = await getTenantCtx(params, req);
            return jsonResponse(await linkBiaToControl(ctx, params.id, body.controlId), { status: 201 });
        },
    ),
);

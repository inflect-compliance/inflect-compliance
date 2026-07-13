import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { addBiaDependency } from '@/app-layer/usecases/business-impact-analysis';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

const AddDependencySchema = z.object({
    dependsOnType: z.enum(['PROCESS', 'ASSET', 'VENDOR', 'RISK']),
    dependsOnId: z.string().min(1),
});

/** POST — attach a dependency (process/asset/vendor/risk) to this BIA. */
export const POST = withApiErrorHandling(
    withValidatedBody(
        AddDependencySchema,
        async (req: NextRequest, { params: p }: { params: Promise<{ tenantSlug: string; id: string }> }, body) => {
            const params = await p;
            const ctx = await getTenantCtx(params, req);
            return jsonResponse(await addBiaDependency(ctx, params.id, body), { status: 201 });
        },
    ),
);

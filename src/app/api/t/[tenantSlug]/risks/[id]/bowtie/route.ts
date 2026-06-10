import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { projectBowTie, toXyFlowGraph } from '@/app-layer/usecases/bowtie-projection';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-7 — bow-tie projection for a single risk (computed at read time). */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const projection = await projectBowTie(ctx, params.id);
        return jsonResponse({ projection, graph: toXyFlowGraph(projection) });
    },
);

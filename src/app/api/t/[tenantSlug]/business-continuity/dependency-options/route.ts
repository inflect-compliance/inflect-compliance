import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { listBiaDependencyOptions } from '@/app-layer/usecases/business-impact-analysis';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { badRequest } from '@/lib/errors/types';

const TypeSchema = z.enum(['PROCESS', 'ASSET', 'VENDOR', 'RISK']);

/**
 * GET /api/t/:slug/business-continuity/dependency-options?type=ASSET
 * Lightweight `{ id, label }` picker options for one dependency type.
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const parsed = TypeSchema.safeParse(req.nextUrl.searchParams.get('type'));
        if (!parsed.success) throw badRequest('INVALID_DEPENDENCY_TYPE', 'Unknown dependency type');
        return jsonResponse({ options: await listBiaDependencyOptions(ctx, parsed.data) });
    },
);

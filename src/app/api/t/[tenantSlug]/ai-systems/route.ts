import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import { listAiSystems, createAiSystem } from '@/app-layer/usecases/ai-system';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import type { AiRiskTier } from '@prisma/client';

/**
 * GET /api/t/:tenantSlug/ai-systems — the AI-System Registry list. Read-gated by
 * the usecase (`assertCanRead`), tenant-scoped by RLS. Optional `?riskTier=` /
 * `?status=` filters.
 */
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const riskTier = req.nextUrl.searchParams.get('riskTier') as AiRiskTier | null;
    const status = req.nextUrl.searchParams.get('status') ?? undefined;
    const systems = await listAiSystems(ctx, {
        riskTier: riskTier ?? undefined,
        status,
    });
    return jsonResponse(systems);
});

/**
 * POST /api/t/:tenantSlug/ai-systems — register an AI system. The usecase runs
 * the deterministic EU AI Act classifier and links the tier's obligations; the
 * client cannot set the tier.
 */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = await req.json();
    const result = await createAiSystem(ctx, body);
    return jsonResponse(result, { status: 201 });
});

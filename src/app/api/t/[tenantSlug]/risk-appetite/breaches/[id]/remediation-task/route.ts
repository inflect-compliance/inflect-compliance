/**
 * POST /api/t/[tenantSlug]/risk-appetite/breaches/[id]/remediation-task
 *
 * RQ2-6 — spawn (or return) THE remediation task for an open
 * appetite breach. Idempotent: the body carries nothing; the task
 * content derives server-side from the breach row, and a breach
 * claims at most one task.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { createBreachRemediationTask } from '@/app-layer/usecases/risk-appetite';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const result = await createBreachRemediationTask(ctx, params.id);
        return jsonResponse(result, { status: result.created ? 201 : 200 });
    },
);

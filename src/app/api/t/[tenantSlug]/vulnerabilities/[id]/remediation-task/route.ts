import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { createVulnerabilityRemediationTask } from '@/app-layer/usecases/vulnerability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// Spawn a remediation Task for a vulnerability (triage flow) via the existing
// createTask usecase, linked to the affected asset, and pin it onto the
// vulnerability's remediationTaskId. Write-gated inside the usecase.
export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const task = await createVulnerabilityRemediationTask(ctx, params.id);
    return jsonResponse(task, { status: 201 });
});

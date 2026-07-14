import { listAllControlChecks } from '@/app-layer/usecases/integrations';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type TestChecksParams = { tenantSlug: string };

/**
 * R3-P1 — tenant-wide automated-check history for the unified /tests surface.
 * Read-only; gated by `controls.view` (the same gate the per-control Checks
 * tab uses — automated checks are control-execution data).
 */
export const GET = withApiErrorHandling(
    requirePermission<TestChecksParams>('controls.view', async (_req, _params, ctx) => {
        const checks = await listAllControlChecks(ctx, { limit: 200 });
        return jsonResponse({ checks });
    }),
);

import { listExecutionsForControl } from '@/app-layer/usecases/integrations';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type ControlExecutionsParams = { tenantSlug: string; controlId: string };

/**
 * PR-1 — automated-check history for one control.
 *
 * Backs the control-detail "Checks" tab: latest `IntegrationExecution`
 * status, per-run `resultJson` summary, and history. Read-only; gated by
 * the same `controls.view` permission as the control itself.
 */
export const GET = withApiErrorHandling(
    requirePermission<ControlExecutionsParams>('controls.view', async (_req, { params }, ctx) => {
        const { controlId } = await params;
        const executions = await listExecutionsForControl(ctx, controlId, { limit: 20 });
        return jsonResponse({ executions });
    }),
);

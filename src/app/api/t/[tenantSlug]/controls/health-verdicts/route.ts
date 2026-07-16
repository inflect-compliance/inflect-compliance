import { getControlHealthVerdicts } from '@/app-layer/usecases/control';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string };

/**
 * Batched control-health verdicts for the whole tenant — backs the control-list
 * Health badge + the controls-dashboard health summary. Read-only; same
 * `controls.view` gate as the list.
 */
export const GET = withApiErrorHandling(
    requirePermission<Params>('controls.view', async (_req, _ctxParams, ctx) => {
        return jsonResponse(await getControlHealthVerdicts(ctx));
    }),
);

import { getIncidentBiaContext } from '@/app-layer/usecases/business-impact-analysis';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type IncidentParams = { tenantSlug: string; incidentId: string };

/**
 * GET — recovery-deadline context for a live incident: the BIAs reachable
 * from the incident's linked controls (control → process → BIA), tightest
 * MTPD first. Gated under `incidents.view` like every /incidents route.
 */
export const GET = withApiErrorHandling(
    requirePermission<IncidentParams>('incidents.view', async (_req, { params }, ctx) => {
        const { incidentId } = await params;
        return jsonResponse({ rows: await getIncidentBiaContext(ctx, incidentId) });
    }),
);

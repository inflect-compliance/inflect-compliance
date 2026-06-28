import { markReportable } from '@/app-layer/usecases/incident';
import { MarkReportableSchema } from '@/app-layer/schemas/incident.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

type IncidentParams = { tenantSlug: string; incidentId: string };

export const POST = withApiErrorHandling(
    requirePermission<IncidentParams>('incidents.manage', async (req, { params }, ctx) => {
        const { incidentId } = await params;
        const body = await parseJsonBody(req, MarkReportableSchema);
        const incident = await markReportable(ctx, incidentId, body);
        return jsonResponse(incident);
    }),
);

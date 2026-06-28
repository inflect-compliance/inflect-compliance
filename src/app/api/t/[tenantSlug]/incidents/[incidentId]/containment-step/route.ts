import { toggleContainmentStep } from '@/app-layer/usecases/incident';
import { ToggleContainmentStepSchema } from '@/app-layer/schemas/incident.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

type IncidentParams = { tenantSlug: string; incidentId: string };

// POST — mark a containment-runbook step complete (or undo it).
export const POST = withApiErrorHandling(
    requirePermission<IncidentParams>('incidents.manage', async (req, { params }, ctx) => {
        const { incidentId } = await params;
        const body = await parseJsonBody(req, ToggleContainmentStepSchema);
        const incident = await toggleContainmentStep(ctx, incidentId, body);
        return jsonResponse(incident);
    }),
);

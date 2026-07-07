import { listBackgroundChecks, recordBackgroundCheck, RecordBackgroundCheckSchema } from '@/app-layer/usecases/training';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/** PR-6 — background checks. List (personnel.view) + record (personnel.manage). */
export const GET = withApiErrorHandling(
    requirePermission<{ tenantSlug: string }>('personnel.view', async (_req, _a, ctx) => {
        return jsonResponse({ checks: await listBackgroundChecks(ctx) });
    }),
);
export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string }>('personnel.manage', async (req, _a, ctx) => {
        const body = await parseJsonBody(req, RecordBackgroundCheckSchema);
        return jsonResponse(await recordBackgroundCheck(ctx, body), { status: 201 });
    }),
);

import { acceptQuestionnaireItem, AcceptItemSchema } from '@/app-layer/usecases/questionnaire';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; itemId: string };
/** PR-9 — accept an item's answer → feed the answer library (controls.edit). */
export const POST = withApiErrorHandling(requirePermission<Params>('controls.edit', async (req, { params }, ctx) => {
    const { itemId } = await params;
    const body = await parseJsonBody(req, AcceptItemSchema);
    return jsonResponse(await acceptQuestionnaireItem(ctx, itemId, body));
}));

import { getQuestionnaireItems } from '@/app-layer/usecases/questionnaire';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; questionnaireId: string };
/** PR-9 — list a questionnaire's items + drafts (controls.view). */
export const GET = withApiErrorHandling(requirePermission<Params>('controls.view', async (_req, { params }, ctx) => {
    const { questionnaireId } = await params;
    return jsonResponse({ items: await getQuestionnaireItems(ctx, questionnaireId) });
}));

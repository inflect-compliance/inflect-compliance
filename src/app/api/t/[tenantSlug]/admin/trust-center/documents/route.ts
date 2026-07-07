import { addTrustCenterDocument, listTrustCenterDocuments, AddDocumentSchema } from '@/app-layer/usecases/trust-center-documents';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/** PR-8 — admin: manage gated trust-center documents (admin.manage). */
export const GET = withApiErrorHandling(requirePermission<{ tenantSlug: string }>('admin.manage', async (_req, _a, ctx) => {
    return jsonResponse({ documents: await listTrustCenterDocuments(ctx) });
}));
export const POST = withApiErrorHandling(requirePermission<{ tenantSlug: string }>('admin.manage', async (req, _a, ctx) => {
    const body = await parseJsonBody(req, AddDocumentSchema);
    return jsonResponse(await addTrustCenterDocument(ctx, body), { status: 201 });
}));

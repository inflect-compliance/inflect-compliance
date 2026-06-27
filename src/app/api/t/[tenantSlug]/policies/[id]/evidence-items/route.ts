import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { parseJsonBody } from '@/lib/validation/route';
import { listPolicyEvidenceItems, addPolicyEvidenceItem } from '@/app-layer/usecases/policy-evidence';
import { jsonResponse } from '@/lib/api-response';

// GET — list the policy's evidence-to-retain checklist items.
export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const items = await listPolicyEvidenceItems(ctx, params.id);
    return jsonResponse(items);
});

const AddItemSchema = z.object({ label: z.string().min(1).max(500) }).strip();

// POST — add a manual checklist item.
export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = await parseJsonBody(req, AddItemSchema);
    const item = await addPolicyEvidenceItem(ctx, params.id, body.label);
    return jsonResponse(item, { status: 201 });
});

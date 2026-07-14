/**
 * POST /api/t/[tenantSlug]/evidence/[id]/replace
 * EP-3 Part 4 — replace the file backing a FILE-type evidence record.
 * Multipart: file. Creates a new FileRecord chained to the prior one and
 * repoints the Evidence, preserving status/reviews/retention/control links.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { replaceEvidenceFile } from '@/app-layer/usecases/evidence';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
        return jsonResponse(
            { error: 'Missing or invalid file in form data' },
            { status: 400 },
        );
    }

    const evidence = await replaceEvidenceFile(ctx, params.id, file);
    return jsonResponse(evidence, { status: 200 });
});

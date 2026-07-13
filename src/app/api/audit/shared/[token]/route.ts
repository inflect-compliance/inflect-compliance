import { NextRequest } from 'next/server';
import { getPackByShareToken, addShareComment } from '@/app-layer/usecases/audit-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { z } from 'zod';

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) => {
    const params = await paramsPromise;
    const data = await getPackByShareToken(params.token);
    return jsonResponse(data);
});

// Return channel — the token-bearing external auditor sends a message
// back to the tenant (comment / request more evidence / raise a
// finding/question). PUBLIC endpoint: the token IS the auth. The default
// mutation rate-limit from withApiErrorHandling guards abuse; the usecase
// re-validates the token (not revoked, not expired) before any write.
const ShareCommentSchema = z.object({
    kind: z.enum(['COMMENT', 'EVIDENCE_REQUEST', 'FINDING', 'QUESTION']),
    body: z.string().min(1).max(10000),
    authorLabel: z.string().max(200).optional(),
    auditPackItemId: z.string().min(1).optional(),
}).strip();

export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) => {
    const params = await paramsPromise;
    const input = ShareCommentSchema.parse(await req.json());
    const created = await addShareComment(params.token, input);
    return jsonResponse(created, { status: 201 });
});

import { NextRequest, NextResponse } from 'next/server';
import { getLegacyCtx } from '@/app-layer/context';
import { getFinding, updateFinding } from '@/app-layer/usecases/finding';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateFindingSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const ctx = await getLegacyCtx(req);
    const finding = await getFinding(ctx, params.id);
    return jsonResponse(finding);
});

export const PUT = withApiErrorHandling(withValidatedBody(UpdateFindingSchema, async (req, { params }: { params: { id: string } }, body) => {
    const ctx = await getLegacyCtx(req);
    const finding = await updateFinding(ctx, params.id, body);
    return jsonResponse({ success: true, finding });
}));

import { NextRequest, NextResponse } from 'next/server';
import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { unlinkWork } from '@/app-layer/usecases/org-security-initiative';

interface RC { params: Promise<{ orgSlug: string; initiativeId: string; linkId: string }> }

export const DELETE = withApiErrorHandling(async (req: NextRequest, rc: RC) => {
    const { linkId, ...rest } = await rc.params;
    const ctx = await getOrgCtx({ orgSlug: rest.orgSlug }, req);
    await unlinkWork(ctx, linkId);
    return NextResponse.json({ ok: true });
});

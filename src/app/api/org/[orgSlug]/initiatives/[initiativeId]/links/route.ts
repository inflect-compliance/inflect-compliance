import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { linkWork, INITIATIVE_LINK_TYPES } from '@/app-layer/usecases/org-security-initiative';

interface RC { params: Promise<{ orgSlug: string; initiativeId: string }> }
const LinkSchema = z
    .object({ tenantId: z.string().min(1), entityType: z.enum(INITIATIVE_LINK_TYPES), entityId: z.string().min(1) })
    .strip();

export const POST = withApiErrorHandling(
    withValidatedBody(LinkSchema, async (req: NextRequest, rc: RC, body) => {
        const { initiativeId, ...rest } = await rc.params;
        const ctx = await getOrgCtx(rest, req);
        return NextResponse.json({ link: await linkWork(ctx, initiativeId, body) });
    }),
);

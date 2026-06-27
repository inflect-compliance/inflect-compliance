import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { changeInitiativeStatus, INITIATIVE_STATUSES } from '@/app-layer/usecases/org-security-initiative';

interface RC { params: Promise<{ orgSlug: string; initiativeId: string }> }
const StatusSchema = z.object({ status: z.enum(INITIATIVE_STATUSES) }).strip();

export const PUT = withApiErrorHandling(
    withValidatedBody(StatusSchema, async (req: NextRequest, rc: RC, body) => {
        const { initiativeId, ...rest } = await rc.params;
        const ctx = await getOrgCtx(rest, req);
        return NextResponse.json({ initiative: await changeInitiativeStatus(ctx, initiativeId, body.status) });
    }),
);

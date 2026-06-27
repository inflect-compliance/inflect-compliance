import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import {
    getInitiative,
    updateInitiative,
    deleteInitiative,
    getInitiativeProgress,
} from '@/app-layer/usecases/org-security-initiative';

interface RC { params: Promise<{ orgSlug: string; initiativeId: string }> }

const UpdateSchema = z
    .object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(8000).nullish(),
        ownerUserId: z.string().nullish(),
        targetDate: z.string().nullish(),
        manualProgressPercent: z.number().int().min(0).max(100).nullish(),
    })
    .strip();

export const GET = withApiErrorHandling(async (req: NextRequest, rc: RC) => {
    const { initiativeId, ...rest } = await rc.params;
    const ctx = await getOrgCtx(rest, req);
    const initiative = await getInitiative(ctx, initiativeId);
    const progress = await getInitiativeProgress(initiative);
    return NextResponse.json({ initiative, progress });
});

export const PATCH = withApiErrorHandling(
    withValidatedBody(UpdateSchema, async (req: NextRequest, rc: RC, body) => {
        const { initiativeId, ...rest } = await rc.params;
        const ctx = await getOrgCtx(rest, req);
        return NextResponse.json({ initiative: await updateInitiative(ctx, initiativeId, body) });
    }),
);

export const DELETE = withApiErrorHandling(async (req: NextRequest, rc: RC) => {
    const { initiativeId, ...rest } = await rc.params;
    const ctx = await getOrgCtx(rest, req);
    await deleteInitiative(ctx, initiativeId);
    return NextResponse.json({ ok: true });
});

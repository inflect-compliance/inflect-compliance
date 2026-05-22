/**
 * Epic D — org invite admin API.
 *
 *   POST /api/org/[orgSlug]/invites
 *     Create or refresh an invite. ORG_ADMIN-only via canManageMembers.
 *     Body: { email, role }. Returns { invite, url }.
 *
 *   GET /api/org/[orgSlug]/invites
 *     List pending invites (non-expired, non-revoked, non-accepted).
 *     ORG_ADMIN-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import {
    createOrgInviteToken,
    listPendingOrgInvites,
} from '@/app-layer/usecases/org-invites';
import { forbidden } from '@/lib/errors/types';

interface RouteContext {
    params: Promise<{ orgSlug: string }>;
}

const CreateOrgInviteInput = z.object({
    email: z.string().email('Valid email required'),
    role: z.enum(['ORG_ADMIN', 'ORG_READER'] as const),
});

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateOrgInviteInput,
        async (req: NextRequest, routeCtx: RouteContext, body) => {
            const ctx = await getOrgCtx((await routeCtx.params), req);
            if (!ctx.permissions.canManageMembers) {
                throw forbidden(
                    'You do not have permission to invite members to this organization',
                );
            }
            const result = await createOrgInviteToken(ctx, {
                email: body.email,
                role: body.role,
            });
            return NextResponse.json(
                {
                    invite: {
                        id: result.invite.id,
                        email: result.invite.email,
                        role: result.invite.role,
                        expiresAt: result.invite.expiresAt.toISOString(),
                        createdAt: result.invite.createdAt.toISOString(),
                    },
                    url: result.url,
                },
                { status: 201 },
            );
        },
    ),
);

export const GET = withApiErrorHandling(
    async (req: NextRequest, routeCtx: RouteContext) => {
        const ctx = await getOrgCtx((await routeCtx.params), req);
        if (!ctx.permissions.canManageMembers) {
            throw forbidden(
                'You do not have permission to view invites for this organization',
            );
        }
        const rows = await listPendingOrgInvites(ctx);
        return NextResponse.json({
            invites: rows.map((r) => ({
                id: r.id,
                email: r.email,
                role: r.role,
                expiresAt: r.expiresAt.toISOString(),
                createdAt: r.createdAt.toISOString(),
                invitedBy: r.invitedBy
                    ? { id: r.invitedBy.id, name: r.invitedBy.name, email: r.invitedBy.email }
                    : null,
            })),
        });
    },
);

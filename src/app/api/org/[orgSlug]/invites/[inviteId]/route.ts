/**
 * Epic D — DELETE /api/org/[orgSlug]/invites/[inviteId]
 *
 * Revoke a pending org invite. ORG_ADMIN-only. Idempotent: 404 if
 * the invite is missing OR already accepted/revoked. Audit row is
 * emitted via revokeOrgInvite in the usecase layer.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { revokeOrgInvite } from '@/app-layer/usecases/org-invites';
import { forbidden } from '@/lib/errors/types';

interface RouteContext {
    params: Promise<{ orgSlug: string; inviteId: string }>;
}

export const DELETE = withApiErrorHandling(
    async (req: NextRequest, routeCtx: RouteContext) => {
        const ctx = await getOrgCtx(
            { orgSlug: (await routeCtx.params).orgSlug },
            req,
        );
        if (!ctx.permissions.canManageMembers) {
            throw forbidden(
                'You do not have permission to revoke invites for this organization',
            );
        }
        await revokeOrgInvite(ctx, { inviteId: (await routeCtx.params).inviteId });
        return NextResponse.json({ revoked: true });
    },
);

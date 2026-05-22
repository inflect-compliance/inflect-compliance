/**
 * Epic B — Org Audit Trail (read API).
 *
 *   GET /api/org/[orgSlug]/audit-log
 *     paginated read of the immutable, hash-chained `OrgAuditLog`
 *     ledger for this organization.
 *
 * RBAC: ORG_ADMIN only (`canManageMembers`). ORG_READER cannot see
 * privilege-mutation history — this is parity with the
 * `/members` route which is also `canManageMembers` gated.
 *
 * Query params:
 *   - cursor : opaque pagination cursor (base64-encoded `{ occurredAt, id }`)
 *              from a prior response's `nextCursor` field
 *   - limit  : 1..100, defaults to 20
 *   - action : optional filter — one of OrgAuditAction enum values
 *              (`ORG_MEMBER_ADDED`, `ORG_MEMBER_REMOVED`,
 *              `ORG_MEMBER_ROLE_CHANGED`,
 *              `ORG_ADMIN_PROVISIONED_TO_TENANTS`,
 *              `ORG_ADMIN_DEPROVISIONED_FROM_TENANTS`)
 *
 * Response shape:
 *   { rows: OrgAuditRow[], nextCursor: string | null }
 *
 * Order: occurredAt DESC, id DESC (newest first — matches the
 * convention of every other audit-list endpoint in the codebase).
 */
import { NextRequest, NextResponse } from 'next/server';

import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { listOrgAudit } from '@/app-layer/usecases/org-audit';
import { badRequest, forbidden } from '@/lib/errors/types';
import { OrgAuditAction } from '@prisma/client';

interface RouteContext {
    params: Promise<{ orgSlug: string }>;
}

const VALID_ACTIONS = new Set<string>(Object.values(OrgAuditAction));

export const GET = withApiErrorHandling(
    async (req: NextRequest, routeCtx: RouteContext) => {
        const ctx = await getOrgCtx((await routeCtx.params), req);
        if (!ctx.permissions.canManageMembers) {
            throw forbidden(
                'You do not have permission to view the audit log of this organization',
            );
        }

        const sp = req.nextUrl.searchParams;
        const cursor = sp.get('cursor');
        const limitParam = sp.get('limit');
        const actionParam = sp.get('action');

        const limit = limitParam ? Number(limitParam) : undefined;
        if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
            throw badRequest('Invalid limit parameter; must be a positive integer');
        }

        let action: OrgAuditAction | undefined;
        if (actionParam) {
            if (!VALID_ACTIONS.has(actionParam)) {
                throw badRequest(
                    `Unsupported action '${actionParam}'. Supported: ${Array.from(VALID_ACTIONS).join(', ')}`,
                );
            }
            action = actionParam as OrgAuditAction;
        }

        const result = await listOrgAudit(ctx, {
            cursor,
            limit,
            action,
        });

        return NextResponse.json(result);
    },
);

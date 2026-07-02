/**
 * Regression — `requirePermission` must await `routeArgs.params`.
 *
 * Under the Next 15+ runtime the route export receives `params` as a
 * Promise. The async-params migration (#636) retired the
 * transparent-await shim in `withApiErrorHandling`, so the wrapper now
 * forwards `ctx` (`{ params }`) through untouched. `permissionedRoute`
 * therefore has to await `routeArgs.params` itself.
 *
 * Without the await, `getTenantCtx` — and `resolveTenantContext` under
 * it — reads `params.tenantSlug` off a Promise, sees `undefined`, and
 * throws `notFound('Tenant identifier required')`. The symptom is a
 * 404 on EVERY privileged route (`admin/*`, `billing/*`, `sso/*`, …):
 * unit tests miss it because they invoke handlers with a plain sync
 * `params` object; only the real Next runtime (and E2E) passes a
 * Promise.
 *
 * This test pins both call shapes — the Promise-shaped params (real
 * Next runtime) and the plain-object params (the unit-test shape) —
 * so a future change that drops the await fails here, fast, in the
 * node project.
 */
import { NextResponse, type NextRequest } from 'next/server';

jest.mock('@/app-layer/context', () => ({ getTenantCtx: jest.fn() }));
jest.mock('@/lib/audit', () => ({ appendAuditEntry: jest.fn() }));

import { requirePermission } from '@/lib/security/permission-middleware';
import { getTenantCtx } from '@/app-layer/context';
import { getPermissionsForRole } from '@/lib/permissions';
import type { RequestContext } from '@/app-layer/types';

const mockGetTenantCtx = getTenantCtx as jest.MockedFunction<typeof getTenantCtx>;

function ownerCtx(): RequestContext {
    return {
        requestId: 'req-test',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tenantSlug: 'acme',
        role: 'OWNER',
        permissions: {
            canRead: true,
            canWrite: true,
            canAdmin: true,
            canAudit: true,
            canExport: true,
        },
        appPermissions: getPermissionsForRole('OWNER'),
    };
}

const req = {
    method: 'GET',
    nextUrl: { pathname: '/api/t/acme/admin/members' },
} as unknown as NextRequest;

/** Loose call signature — accepts either params shape the runtime can pass. */
type LooseRoute = (
    req: NextRequest,
    routeArgs: {
        params:
            | { tenantSlug: string }
            | Promise<{ tenantSlug: string }>;
    },
) => Promise<Response>;

describe('requirePermission — async params resolution (#636 regression)', () => {
    beforeEach(() => {
        mockGetTenantCtx.mockReset();
        mockGetTenantCtx.mockResolvedValue(ownerCtx());
    });

    it('awaits a Promise-shaped routeArgs.params (the Next 15+ runtime shape)', async () => {
        const handler = jest
            .fn()
            .mockResolvedValue(NextResponse.json({ ok: true }));
        const route = requirePermission(
            'admin.members',
            handler,
        ) as unknown as LooseRoute;

        await route(req, {
            params: Promise.resolve({ tenantSlug: 'acme' }),
        });

        // getTenantCtx must receive the RESOLVED object — never the
        // Promise. A Promise here is the exact bug: `.tenantSlug` is
        // `undefined` on it and `resolveTenantContext` throws.
        expect(mockGetTenantCtx).toHaveBeenCalledTimes(1);
        const firstArg = mockGetTenantCtx.mock.calls[0][0];
        expect(firstArg).not.toBeInstanceOf(Promise);
        expect(firstArg).toEqual({ tenantSlug: 'acme' });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('forwards RESOLVED params to the handler (dynamic segments readable)', async () => {
        // The bug: `permissionedRoute` awaited params for getTenantCtx but
        // forwarded the still-unawaited Promise to the handler, so a handler
        // reading `params.id` off `/gap-assessments/[id]/…` got `undefined`
        // (silent for a tolerant findMany, a 500 for a required composite key).
        let seenParams: unknown;
        const handler = jest.fn(async (_req, routeArgs) => {
            seenParams = routeArgs.params;
            return NextResponse.json({ ok: true });
        });
        const route = requirePermission(
            'admin.members',
            handler as never,
        ) as unknown as LooseRoute;

        await route(req, {
            params: Promise.resolve({ tenantSlug: 'acme', id: 'assessment-123' }) as never,
        });

        expect(seenParams).not.toBeInstanceOf(Promise);
        expect(seenParams).toEqual({ tenantSlug: 'acme', id: 'assessment-123' });
        expect((seenParams as { id: string }).id).toBe('assessment-123');
    });

    it('still accepts a plain sync params object (the unit-test call shape)', async () => {
        const handler = jest
            .fn()
            .mockResolvedValue(NextResponse.json({ ok: true }));
        const route = requirePermission(
            'admin.members',
            handler,
        ) as unknown as LooseRoute;

        await route(req, { params: { tenantSlug: 'acme' } });

        const firstArg = mockGetTenantCtx.mock.calls[0][0];
        expect(firstArg).toEqual({ tenantSlug: 'acme' });
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

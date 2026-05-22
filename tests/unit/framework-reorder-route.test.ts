/**
 * Epic 46.4 — `POST /api/t/[tenantSlug]/frameworks/[frameworkKey]/reorder`.
 *
 * Mocks `getTenantCtx` + the `reorderFrameworkRequirements` usecase.
 * Asserts:
 *   - 200 + body propagated to the usecase on the happy path
 *   - 400 on a malformed body (missing sections / wrong shape)
 *   - 403 when the policy denies (non-admin caller)
 *   - 404 when the framework key is unknown
 */

import { NextRequest } from 'next/server';

const getTenantCtxMock = jest.fn();
const reorderMock = jest.fn();

jest.mock('@/app-layer/context', () => ({
    __esModule: true,
    getTenantCtx: (...a: unknown[]) => getTenantCtxMock(...a),
}));

jest.mock('@/app-layer/usecases/framework', () => ({
    __esModule: true,
    reorderFrameworkRequirements: (...a: unknown[]) => reorderMock(...a),
}));

import { POST } from '@/app/api/t/[tenantSlug]/frameworks/[frameworkKey]/reorder/route';
import { forbidden, notFound } from '@/lib/errors/types';
import { getPermissionsForRole } from '@/lib/permissions';
import type { Role } from '@prisma/client';

function ctxFor(role: Role) {
    return {
        tenantId: 'tenant-1',
        userId: 'user-1',
        requestId: 'req',
        tenantSlug: 'acme',
        role,
        permissions: { canRead: true, canWrite: false, canAdmin: false, canAudit: false, canExport: false },
        appPermissions: getPermissionsForRole(role),
    };
}

function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/t/acme/frameworks/ISO27001/reorder', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    getTenantCtxMock.mockReset();
    reorderMock.mockReset();
});

describe('POST /api/t/[slug]/frameworks/[key]/reorder', () => {
    const validBody = {
        sections: [
            { sectionId: 'section:fw:org', requirementIds: ['r-1', 'r-2'] },
            { sectionId: 'section:fw:people', requirementIds: ['r-3'] },
        ],
    };

    it('returns 200 + forwards the body to the usecase', async () => {
        getTenantCtxMock.mockResolvedValue(ctxFor('ADMIN'));
        reorderMock.mockResolvedValue({ updated: 3 });

        const res = await POST(makeRequest(validBody), {
            params: Promise.resolve({ tenantSlug: 'acme', frameworkKey: 'ISO27001' }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ updated: 3 });
        expect(reorderMock).toHaveBeenCalledTimes(1);
        expect(reorderMock.mock.calls[0][1]).toBe('ISO27001');
        expect(reorderMock.mock.calls[0][2]).toEqual(validBody.sections);
    });

    it('returns 400 on malformed body (missing sections)', async () => {
        getTenantCtxMock.mockResolvedValue(ctxFor('ADMIN'));

        const res = await POST(makeRequest({}), {
            params: Promise.resolve({ tenantSlug: 'acme', frameworkKey: 'ISO27001' }),
        });
        expect(res.status).toBe(400);
        expect(reorderMock).not.toHaveBeenCalled();
    });

    it('returns 400 on malformed body (sections is not an array)', async () => {
        getTenantCtxMock.mockResolvedValue(ctxFor('ADMIN'));
        const res = await POST(makeRequest({ sections: 'oops' }), {
            params: Promise.resolve({ tenantSlug: 'acme', frameworkKey: 'ISO27001' }),
        });
        expect(res.status).toBe(400);
    });

    it('returns 403 when the policy denies (READER role)', async () => {
        getTenantCtxMock.mockResolvedValue(ctxFor('READER'));
        reorderMock.mockRejectedValue(
            forbidden('Only OWNER or ADMIN can install framework packs'),
        );
        const res = await POST(makeRequest(validBody), {
            params: Promise.resolve({ tenantSlug: 'acme', frameworkKey: 'ISO27001' }),
        });
        expect(res.status).toBe(403);
    });

    it('returns 404 when the framework key is unknown', async () => {
        getTenantCtxMock.mockResolvedValue(ctxFor('ADMIN'));
        reorderMock.mockRejectedValue(notFound('Framework not found'));
        const res = await POST(makeRequest(validBody), {
            params: Promise.resolve({ tenantSlug: 'acme', frameworkKey: 'no-such-fw' }),
        });
        expect(res.status).toBe(404);
    });
});

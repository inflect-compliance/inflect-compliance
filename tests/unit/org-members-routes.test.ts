/**
 * Epic O-2 — org members route layer (POST + PUT + DELETE).
 *
 * Mocks the org-context resolver and the usecase layer so the test
 * exercises the route's permission gates, body validation, and
 * dispatch — without touching Prisma. Usecase behaviour is covered
 * in `org-members-usecase.test.ts` and `tests/integration/org-role-
 * change.test.ts`.
 */
import { NextRequest } from 'next/server';

const getOrgCtxMock = jest.fn();
const addOrgMemberMock = jest.fn();
const changeOrgMemberRoleMock = jest.fn();
const removeOrgMemberMock = jest.fn();

jest.mock('@/app-layer/context', () => ({
    __esModule: true,
    getOrgCtx: (...a: unknown[]) => getOrgCtxMock(...a),
}));

jest.mock('@/app-layer/usecases/org-members', () => ({
    __esModule: true,
    addOrgMember: (...a: unknown[]) => addOrgMemberMock(...a),
    changeOrgMemberRole: (...a: unknown[]) => changeOrgMemberRoleMock(...a),
    removeOrgMember: (...a: unknown[]) => removeOrgMemberMock(...a),
}));

import { PUT } from '@/app/api/org/[orgSlug]/members/route';

function ctxFor(canManageMembers: boolean) {
    return {
        requestId: 'req-test',
        userId: 'caller-1',
        organizationId: 'org-1',
        orgSlug: 'acme-org',
        orgRole: canManageMembers ? 'ORG_ADMIN' : 'ORG_READER',
        permissions: {
            canViewPortfolio: true,
            canDrillDown: canManageMembers,
            canExportReports: true,
            canManageTenants: canManageMembers,
            canManageMembers,
        },
    };
}

function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/org/acme-org/members', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    getOrgCtxMock.mockReset();
    addOrgMemberMock.mockReset();
    changeOrgMemberRoleMock.mockReset();
    removeOrgMemberMock.mockReset();
});

describe('PUT /api/org/[orgSlug]/members', () => {
    it('promotes a member when the caller has canManageMembers', async () => {
        getOrgCtxMock.mockResolvedValue(ctxFor(true));
        changeOrgMemberRoleMock.mockResolvedValue({
            membership: {
                id: 'mem-1',
                organizationId: 'org-1',
                userId: 'user-2',
                role: 'ORG_ADMIN',
            },
            transition: 'reader_to_admin',
            provision: { created: 3, skipped: 0, totalConsidered: 3 },
        });

        const res = await PUT(
            makeRequest({ userId: 'user-2', role: 'ORG_ADMIN' }),
            { params: Promise.resolve({ orgSlug: 'acme-org' }) },
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.transition).toBe('reader_to_admin');
        expect(body.provisioned).toEqual({
            created: 3,
            skipped: 0,
            totalConsidered: 3,
        });
        expect(body.deprovisioned).toBeNull();
        expect(changeOrgMemberRoleMock).toHaveBeenCalledTimes(1);
    });

    it('demotes a member with the deprovisioning fan-in metadata', async () => {
        getOrgCtxMock.mockResolvedValue(ctxFor(true));
        changeOrgMemberRoleMock.mockResolvedValue({
            membership: {
                id: 'mem-1',
                organizationId: 'org-1',
                userId: 'user-2',
                role: 'ORG_READER',
            },
            transition: 'admin_to_reader',
            deprovision: { deleted: 2, tenantIds: ['t-1', 't-2'] },
        });

        const res = await PUT(
            makeRequest({ userId: 'user-2', role: 'ORG_READER' }),
            { params: Promise.resolve({ orgSlug: 'acme-org' }) },
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.transition).toBe('admin_to_reader');
        expect(body.provisioned).toBeNull();
        expect(body.deprovisioned).toEqual({
            deleted: 2,
            tenantIds: ['t-1', 't-2'],
        });
    });

    it('passes through the no-op response shape without provisioning data', async () => {
        getOrgCtxMock.mockResolvedValue(ctxFor(true));
        changeOrgMemberRoleMock.mockResolvedValue({
            membership: {
                id: 'mem-1',
                organizationId: 'org-1',
                userId: 'user-2',
                role: 'ORG_READER',
            },
            transition: 'noop',
        });

        const res = await PUT(
            makeRequest({ userId: 'user-2', role: 'ORG_READER' }),
            { params: Promise.resolve({ orgSlug: 'acme-org' }) },
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.transition).toBe('noop');
        expect(body.provisioned).toBeNull();
        expect(body.deprovisioned).toBeNull();
    });

    it('returns 403 when the caller lacks canManageMembers (ORG_READER)', async () => {
        getOrgCtxMock.mockResolvedValue(ctxFor(false));

        const res = await PUT(
            makeRequest({ userId: 'user-2', role: 'ORG_ADMIN' }),
            { params: Promise.resolve({ orgSlug: 'acme-org' }) },
        );

        expect(res.status).toBe(403);
        // Usecase MUST NOT be invoked when the gate refuses.
        expect(changeOrgMemberRoleMock).not.toHaveBeenCalled();
    });

    it('returns 400 when the body is missing the userId', async () => {
        getOrgCtxMock.mockResolvedValue(ctxFor(true));

        const res = await PUT(
            makeRequest({ role: 'ORG_ADMIN' }),
            { params: Promise.resolve({ orgSlug: 'acme-org' }) },
        );

        expect(res.status).toBe(400);
        expect(changeOrgMemberRoleMock).not.toHaveBeenCalled();
    });

    it('returns 400 when role is not in the enum', async () => {
        getOrgCtxMock.mockResolvedValue(ctxFor(true));

        const res = await PUT(
            makeRequest({ userId: 'user-2', role: 'OWNER' }),
            { params: Promise.resolve({ orgSlug: 'acme-org' }) },
        );

        expect(res.status).toBe(400);
        expect(changeOrgMemberRoleMock).not.toHaveBeenCalled();
    });
});
